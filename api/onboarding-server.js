/**
 * Onboarding API routes.
 * Mount via mountOnboarding(app, { marble }).
 */

import express from 'express';
import { validateOnboardingAnswers } from '../core/onboarding/schema.js';
import { getShopsForCity, getKnownCities } from '../core/onboarding/shops-registry.js';
import { STEPS } from '../core/onboarding/steps.js';
import { runEnrichment } from '../core/enrichment/index.js';
import { inferTwitterProfile, inferProfileFromPosts, applySocialProfileToKg, parseHandle } from '../core/onboarding/social-profile.js';
import { generateQuestions, checkAutoFill } from '../core/profiling/questions.js';

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

async function seedSources(answers) {
  const vivoFactoryUrl = (process.env.VIVO_FACTORY_URL ?? '').replace(/\/$/, '');
  const audienceId = process.env.AUDIENCE_ID ?? '';
  if (!vivoFactoryUrl || !audienceId) return;
  try {
    await fetch(`${vivoFactoryUrl}/api/audiences/${audienceId}/sources/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: answers.location?.city ?? '',
        passions: answers.passions ?? [],
        foodPreferences: answers.foodPreferences ?? [],
        movieGenres: answers.movieGenres ?? [],
      }),
    });
  } catch (err) {
    console.error('[onboarding] source seeding error:', err.message);
  }
}

/**
 * Build a minimal chat-completions LLM function from openAiOptions.
 * Used for profiling question regeneration after social profile import.
 */
function buildLlmFn(openAiOptions) {
  const { apiKey, baseUrl, model } = openAiOptions ?? {};
  if (!apiKey) return null;
  const base = (baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  return async (prompt) => {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model ?? 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  };
}

/**
 * After a social profile is applied to the KG, stale startup questions
 * (generated from an empty KG) are cleared and regenerated from the
 * now-populated graph so questions target actual gaps rather than basics.
 */
async function refreshProfilingQuestions(kg, llmFn) {
  try {
    // Mark any pending question as auto_filled if the KG now covers it
    checkAutoFill(kg);

    // Drop remaining pending questions — they were generated from an empty KG
    if (Array.isArray(kg.user.profilingQuestions)) {
      kg.user.profilingQuestions = kg.user.profilingQuestions.filter(q => q.status !== 'pending');
    }
    // Reset the generation timestamp so shouldGenerate() returns true
    kg.user.lastProfilingGenerated = null;

    await generateQuestions(kg, llmFn);
    console.log('[onboarding] profiling questions regenerated from populated KG');
  } catch (err) {
    console.error('[onboarding] question refresh error:', err.message);
  }
}

export function mountOnboarding(app, { marble, openAiOptions }) {
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
      if (openAiOptions?.apiKey) {
        runEnrichment(marble.kg, openAiOptions).catch(err =>
          console.error('[onboarding] post-onboard enrichment error:', err.message)
        );
      }
      seedSources(validation.value);
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
      if (openAiOptions?.apiKey) {
        runEnrichment(marble.kg, openAiOptions).catch(err =>
          console.error('[onboarding] post-onboard enrichment error:', err.message)
        );
      }
      seedSources(validation.value);
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

  // ── POST /onboarding/social ──────────────────────────────
  router.post('/social', submitLimiter, async (req, res) => {
    const { handle, platform = 'twitter', posts_text } = req.body ?? {};

    if (platform !== 'twitter') {
      return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}. Only "twitter" is supported.` });
    }

    const cleanHandle = parseHandle(handle ?? '') || null;
    const cleanPosts = typeof posts_text === 'string' ? posts_text.trim() : '';

    if (!cleanHandle && !cleanPosts) {
      return res.status(400).json({ success: false, error: 'Provide a Twitter handle or posts_text.' });
    }

    try {
      const profile = cleanPosts
        ? await inferProfileFromPosts(cleanPosts, cleanHandle, {
            apiKey: openAiOptions?.apiKey,
            baseUrl: openAiOptions?.baseUrl,
            model: openAiOptions?.model,
          })
        : await inferTwitterProfile(cleanHandle, {
            apiKey: openAiOptions?.apiKey,
            baseUrl: openAiOptions?.baseUrl,
            model: openAiOptions?.model,
          });

      const counts = applySocialProfileToKg(marble.kg, profile);
      await marble.kg.save();

      const llmFn = buildLlmFn(openAiOptions);
      if (llmFn) {
        refreshProfilingQuestions(marble.kg, llmFn)
          .then(() => marble.kg.save())
          .catch(() => {});
      }

      seedSources({
        location: profile.location.city ? { city: profile.location.city } : { city: '' },
        passions: profile.passions,
        foodPreferences: profile.foodPreferences,
        movieGenres: profile.movieGenres,
      });

      if (openAiOptions?.apiKey) {
        runEnrichment(marble.kg, openAiOptions).catch(err =>
          console.error('[onboarding/social] post-apply enrichment error:', err.message)
        );
      }

      res.json({
        success: true,
        data: {
          handle: cleanHandle,
          displayName: profile.displayName,
          inferredBio: profile.inferredBio,
          location: profile.location,
          ageBracket: profile.ageBracket,
          passions: profile.passions,
          counts,
          sources: profile.sources,
        },
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        return res.status(504).json({ success: false, error: 'Profile research timed out. Please try again.' });
      }
      console.error('[onboarding/social] error:', err.message);
      res.status(500).json({ success: false, error: 'Profile inference failed. Please try again.' });
    }
  });

  // ── POST /onboarding/social/stream ───────────────────────
  router.post('/social/stream', submitLimiter, async (req, res) => {
    const { handle, platform = 'twitter', posts_text } = req.body ?? {};

    if (platform !== 'twitter') {
      return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}` });
    }

    const cleanHandle = parseHandle(handle ?? '') || null;
    const cleanPosts = typeof posts_text === 'string' ? posts_text.trim() : '';

    if (!cleanHandle && !cleanPosts) {
      return res.status(400).json({ success: false, error: 'Provide a Twitter handle or posts_text.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (stage, payload = {}) => {
      res.write(`data: ${JSON.stringify({ stage, ...payload })}\n\n`);
      res.flush?.();
    };

    let heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); res.flush?.(); }, 5000);
    const stopHeartbeat = () => clearInterval(heartbeat);

    // Use a standalone 8-minute timeout — do NOT tie abort to req.on('close').
    // Node.js emits 'close' on IncomingMessage once the POST body is consumed,
    // which would abort the signal before the LLM call even starts.
    const controller = new AbortController();
    const inferTimeout = setTimeout(() => controller.abort(), 8 * 60 * 1000);

    let clientGone = false;
    res.on('close', () => { clientGone = true; });

    try {
      send('start', { handle: cleanHandle || 'posts' });

      const profile = cleanPosts
        ? await inferProfileFromPosts(cleanPosts, cleanHandle, {
            apiKey: openAiOptions?.apiKey,
            baseUrl: openAiOptions?.baseUrl,
            model: openAiOptions?.model,
            signal: controller.signal,
            onProgress: (stage, payload) => send(stage, payload),
          })
        : await inferTwitterProfile(cleanHandle, {
            apiKey: openAiOptions?.apiKey,
            baseUrl: openAiOptions?.baseUrl,
            model: openAiOptions?.model,
            signal: controller.signal,
            onProgress: (stage, payload) => send(stage, payload),
          });

      clearTimeout(inferTimeout);
      send('applying', { passions: profile.passions, location: profile.location });

      const counts = applySocialProfileToKg(marble.kg, profile);
      await marble.kg.save();

      // Regenerate profiling questions now that KG has real data
      const llmFn = buildLlmFn(openAiOptions);
      if (llmFn) {
        refreshProfilingQuestions(marble.kg, llmFn)
          .then(() => marble.kg.save())
          .catch(() => {});
      }

      seedSources({
        location: profile.location.city ? { city: profile.location.city } : { city: '' },
        passions: profile.passions,
        foodPreferences: profile.foodPreferences,
        movieGenres: profile.movieGenres,
      });

      if (openAiOptions?.apiKey) {
        runEnrichment(marble.kg, openAiOptions).catch(err =>
          console.error('[onboarding/social] post-apply enrichment error:', err.message)
        );
      }

      stopHeartbeat();
      send('done', {
        handle: cleanHandle,
        displayName: profile.displayName,
        inferredBio: profile.inferredBio,
        location: profile.location,
        ageBracket: profile.ageBracket,
        passions: profile.passions,
        counts,
        sources: profile.sources,
      });
    } catch (err) {
      clearTimeout(inferTimeout);
      stopHeartbeat();
      console.error('[onboarding/social] stream error (clientGone=%s):', clientGone, err.name, err.message);
      if (!clientGone) {
        const msg = err.name === 'AbortError'
          ? 'Profile research timed out. Please try again.'
          : 'Profile inference failed. Please try again.';
        send('error', { error: msg });
      }
    } finally {
      setTimeout(() => res.end(), 150);
    }
  });

  app.use('/onboarding', router);
}
