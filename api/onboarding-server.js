/**
 * Onboarding API routes.
 * Mount via mountOnboarding(app, { marble }).
 */

import express from 'express';
import { validateOnboardingAnswers } from '../core/onboarding/schema.js';
import { getShopsForCity, getKnownCities } from '../core/onboarding/shops-registry.js';
import { STEPS } from '../core/onboarding/steps.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 10;

/** Minimal in-memory rate limiter (per IP) with automatic stale-entry pruning. */
function createRateLimiter(windowMs, max) {
  const hits = new Map();

  // Prune stale entries every window to prevent unbounded memory growth
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (now - entry.start > windowMs) hits.delete(ip);
    }
  }, windowMs);
  pruneInterval.unref?.(); // don't keep process alive

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || now - entry.start > windowMs) {
      hits.set(ip, { count: 1, start: now });
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ success: false, error: 'Too many requests, please try again later.' });
    }
    next();
  };
}

/**
 * @param {import('express').Application} app
 * @param {{ marble: import('../core/index.js').Marble }} param1
 */
export function mountOnboarding(app, { marble }) {
  const router = express.Router();
  const submitLimiter = createRateLimiter(RATE_WINDOW_MS, RATE_MAX);

  // ── GET /onboarding/steps ────────────────────────────────
  router.get('/steps', (req, res) => {
    res.json({ success: true, data: { steps: STEPS, knownCities: getKnownCities() } });
  });

  // ── GET /onboarding/shops?city= ──────────────────────────
  router.get('/shops', (req, res) => {
    const city = (req.query.city || '').trim();
    if (!city) {
      return res.status(400).json({ success: false, error: 'city query parameter is required' });
    }
    const shops = getShopsForCity(city);
    res.json({ success: true, data: { city, shops } });
  });

  // ── POST /onboarding/submit ──────────────────────────────
  router.post('/submit', submitLimiter, async (req, res) => {
    const validation = validateOnboardingAnswers(req.body);
    if (!validation.ok) {
      return res.status(400).json({ success: false, error: validation.errors.join('; ') });
    }

    const deepResearch = process.env.MARBLE_ONBOARDING_DEEP_RESEARCH !== 'false';

    try {
      const result = await marble.onboard(validation.value, { deepResearch });
      res.json({
        success: true,
        data: {
          kgSummary: result.kgSummary,
          seedCounts: result.seedCounts,
          enrichmentCounts: result.enrichmentCounts,
          citations: result.enrichment?.citations || [],
          enrichmentError: result.enrichmentError,
        },
      });
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        return res.status(400).json({ success: false, error: err.errors.join('; ') });
      }
      console.error('[onboarding] submit error:', err.message);
      res.status(500).json({ success: false, error: 'Onboarding failed. Please try again.' });
    }
  });

  // ── POST /onboarding/submit/stream ───────────────────────
  router.post('/submit/stream', submitLimiter, async (req, res) => {
    const validation = validateOnboardingAnswers(req.body);
    if (!validation.ok) {
      return res.status(400).json({ success: false, error: validation.errors.join('; ') });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (stage, payload = {}) => {
      res.write(`data: ${JSON.stringify({ stage, ...payload })}\n\n`);
    };

    // Keep-alive heartbeat during research (every 5s)
    let heartbeat;
    const startHeartbeat = () => {
      heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 5000);
    };
    const stopHeartbeat = () => clearInterval(heartbeat);

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const deepResearch = process.env.MARBLE_ONBOARDING_DEEP_RESEARCH !== 'false';

    try {
      send('validated');
      startHeartbeat();

      await marble.onboard(validation.value, {
        deepResearch,
        signal: controller.signal,
        onProgress: (stage, payload = {}) => send(stage, payload),
      });

      stopHeartbeat();
    } catch (err) {
      stopHeartbeat();
      if (err.name !== 'AbortError') {
        console.error('[onboarding] stream error:', err.message);
        send('error', { error: 'Onboarding failed. Please try again.' });
      }
    } finally {
      res.end();
    }
  });

  app.use('/onboarding', router);
}
