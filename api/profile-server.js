#!/usr/bin/env node

/**
 * Marble Profile Server
 *
 * HTTP sidecar for OpenClaw. Exposes the Marble personalization engine
 * as a REST API that the user-profile-plugin inside OpenClaw calls.
 *
 * Routes:
 *   GET  /healthz                          → liveness probe
 *   POST /user-profile/profile/facts       → seed/update user interests + context
 *   POST /user-profile/profile/decisions   → record item reaction (up/down/skip/share)
 *   GET  /user-profile/graph/summary       → KG summary (interests, beliefs, identities)
 *   GET  /user-profile/graph/debug         → full KG user dump
 *
 * Environment:
 *   PORT                 (default: 5400)
 *   PROFILE_STORAGE_PATH (default: /data/user-profile)
 *   OPENAI_API_KEY       optional — enables LLM-powered preference learning
 *   OPENAI_MODEL         optional — defaults to gpt-4o-mini
 *   LLM_MODEL            optional — alias for OPENAI_MODEL
 */

import express from 'express';
import { Marble } from '../core/index.js';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { executeQuery } from './cypher-executor.js';
import { handleChat } from './chat.js';
import { buildUiHtml } from './ui.js';
import { mountOnboarding } from './onboarding-server.js';
import { mountEnrichment } from './enrichment-server.js';
import { mountProfiling } from './profiling-server.js';
import { generateQuestions, shouldGenerate } from '../core/profiling/questions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? '5400', 10);
const STORAGE_DIR = process.env.PROFILE_STORAGE_PATH ?? '/data/user-profile';
const KG_FILE = join(STORAGE_DIR, 'marble-kg.json');

// Ensure storage directory exists
if (!existsSync(STORAGE_DIR)) {
  mkdirSync(STORAGE_DIR, { recursive: true });
}

// Build LLM function if OpenAI key is available
function buildLlm() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

  return async (prompt) => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  };
}

const llmFn = buildLlm();

const marble = new Marble({
  storage: KG_FILE,
  llm: llmFn,
  mode: 'score',
  count: 10,
});

// Run profiling question generation if due (weekly cadence).
async function maybeGenerateProfilingQuestions() {
  if (!llmFn || !marble.kg) return;
  if (!shouldGenerate(marble.kg)) return;
  try {
    const result = await generateQuestions(marble.kg, llmFn);
    if (result.generated > 0) {
      await marble.kg.save();
      console.log(`[profiling] generated ${result.generated} questions`);
    }
  } catch (err) {
    console.error('[profiling] generation error:', err.message);
  }
}

// Initialize eagerly so /healthz is only green once the KG is loaded
let ready = false;
let initError = null;
marble.init().then(async () => {
  ready = true;

  // Ensure suggestions array exists without modifying kg.js
  if (!Array.isArray(marble.kg.user.suggestions)) {
    marble.kg.user.suggestions = [];
  }

  // Mount onboarding API after marble is ready so routes share the same instance
  mountOnboarding(app, { marble, openAiOptions: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  } });

  // Mount enrichment API
  mountEnrichment(app, {
    marble,
    openAiOptions: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    },
  });

  // Mount profiling API
  mountProfiling(app, { marble, llmFn });

  // Generate profiling questions on startup if due, then check hourly
  await maybeGenerateProfilingQuestions();
  setInterval(maybeGenerateProfilingQuestions, 60 * 60 * 1000);

  console.log(`[profile-server] marble initialized (kg=${KG_FILE})`);
}).catch((err) => {
  initError = err;
  console.error('[profile-server] marble init failed:', err.message);
});

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Onboarding wizard (static files + API routes) ─────────────────────────────
// Serve CSS/JS from web/onboarding/ at /onboarding/
app.use('/onboarding', express.static(join(__dirname, '../web/onboarding')));
// Serve the wizard HTML at /onboarding/ (index.html redirect)
app.get('/onboarding', (_req, res) => {
  res.sendFile(join(__dirname, '../web/onboarding/index.html'));
});

// Alias so any stale /dashboard links land somewhere useful
app.get('/dashboard', (_req, res) => res.redirect('/user-profile/graph/ui'));

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/healthz', (_req, res) => {
  if (initError) {
    res.status(503).json({ status: 'error', error: initError.message });
  } else if (!ready) {
    res.status(503).json({ status: 'starting' });
  } else {
    res.json({ status: 'ok' });
  }
});

// ── Facts ─────────────────────────────────────────────────────────────────────
//
// Accepts a flexible body for seeding audience demographics into the KG.
// Any field recognized by the KG is applied; unknown fields are ignored.
//
// Body shape:
//   {
//     interests?: string[],                  // topic labels to boost
//     context?: {
//       calendar?: string[],
//       active_projects?: string[],
//       recent_conversations?: string[],
//       mood_signal?: string
//     },
//     beliefs?: { topic: string, claim: string, strength?: number }[],
//     preferences?: { type: string, description: string, strength?: number }[],
//     identities?: { role: string, context?: string, salience?: number }[]
//   }

app.post('/user-profile/profile/facts', async (req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  try {
    const body = req.body ?? {};
    const kg = marble.kg;

    if (Array.isArray(body.interests)) {
      for (const topic of body.interests) {
        if (typeof topic === 'string' && topic.trim()) {
          kg.boostInterest(topic.trim(), 0.2);
        }
      }
    }

    if (body.context && typeof body.context === 'object') {
      kg.setContext(body.context);
    }

    if (Array.isArray(body.beliefs)) {
      for (const b of body.beliefs) {
        if (b.topic && b.claim) {
          kg.addBelief(b.topic, b.claim, b.strength ?? 0.7);
        }
      }
    }

    if (Array.isArray(body.preferences)) {
      for (const p of body.preferences) {
        if (p.type && p.description) {
          kg.addPreference(p.type, p.description, p.strength ?? 0.7);
        }
      }
    }

    if (Array.isArray(body.identities)) {
      for (const id of body.identities) {
        if (id.role) {
          kg.addIdentity(id.role, id.context ?? '', id.salience ?? 0.8);
        }
      }
    }

    await kg.save();
    res.json({ success: true });
  } catch (err) {
    console.error('[profile-server] facts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Decisions ─────────────────────────────────────────────────────────────────
//
// Record a reaction to a content item.
//
// Body shape:
//   {
//     item: {
//       id: string,
//       title?: string,
//       topics?: string[],
//       source?: string
//     },
//     reaction: 'up' | 'down' | 'skip' | 'share'
//   }

app.post('/user-profile/profile/decisions', async (req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  try {
    const { item, reaction } = req.body ?? {};
    if (!item || !reaction) {
      res.status(400).json({ error: 'body must include item and reaction' });
      return;
    }

    await marble.react(item, reaction);
    res.json({ success: true });
  } catch (err) {
    console.error('[profile-server] decisions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Select / Score Items ──────────────────────────────────────────────────────

app.post('/user-profile/select', async (req, res) => {
  if (!ready) {
    res.status(503).json({ ok: false, errors: ['not ready'] });
    return;
  }
  try {
    const { items = [], context = {} } = req.body ?? {};
    const limit = context.limit ?? items.length;
    const selected = await marble.select(items, { ...context, arcReorder: false });
    const ranked = selected
      .slice(0, limit)
      .map((entry, idx) => {
        const id = (entry.story ?? entry).id ?? entry.id;
        return { id, score: entry.score ?? 0.5, rank: entry.rank ?? (idx + 1) };
      });
    res.json({ ok: true, data: { selected: ranked } });
  } catch (err) {
    console.error('[profile-server] select error:', err.message);
    res.status(500).json({ ok: false, errors: [err.message] });
  }
});

// ── Graph Summary ─────────────────────────────────────────────────────────────

app.get('/user-profile/graph/summary', (_req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  try {
    const kg = marble.kg;
    const topInterests = [...(kg.user.interests ?? [])]
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 20);

    res.json({
      interests: topInterests,
      memory: kg.getMemoryNodesSummary(),
      context: kg.user.context,
      last_insight: kg.getLastInsightResult(),
      wikidataLabels: kg.user.wikidataLabels ?? {},
    });
  } catch (err) {
    console.error('[profile-server] summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Graph UI (SPA) ────────────────────────────────────────────────────────────

app.get('/user-profile/graph/ui', (_req, res) => {
  if (!ready) {
    res.status(503).send('<h1>Starting…</h1>');
    return;
  }

  try {
    const audienceId = process.env.AUDIENCE_ID ?? 'unknown';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildUiHtml(audienceId, KG_FILE));
  } catch (err) {
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

app.post('/ui/decide', async (req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  try {
    const { decision, item_id } = req.body ?? {};
    if (!decision || !item_id) {
      res.status(400).json({ error: 'body must include decision and item_id' });
      return;
    }

    const safeId = raw => String(raw ?? '').replace(/[^A-Za-z0-9._-]/g, '_');
    const suggestions = marble.kg.user.suggestions ?? [];
    const suggestion = suggestions.find(s => safeId(s.id) === item_id);
    if (!suggestion) {
      res.status(404).json({ error: 'suggestion not found' });
      return;
    }

    suggestion.status = decision === 'approve' ? 'approved' : 'rejected';
    suggestion.decided_at = new Date().toISOString();
    await marble.kg.save();
    res.json({ message: `${decision === 'approve' ? 'Approved' : 'Rejected'}: ${suggestion.label}` });
  } catch (err) {
    console.error('[profile-server] ui/decide error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Graph Nodes (vis-network format) ──────────────────────────────────────────

app.get('/user-profile/graph/nodes', (_req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  try {
    const kg = marble.kg;
    const user = kg.user;
    const nodes = [];
    const edges = [];
    const seenIds = new Set();

    const wikidataLabels = kg.user.wikidataLabels ?? {};
    const resolveLabel = topic => {
      if (!topic.startsWith('wikidata:')) return topic;
      const qid = topic.slice('wikidata:'.length);
      return wikidataLabels[qid]?.label ?? topic;
    };

    // Sanitise a raw string into a safe node ID, then make it unique.
    const safeId = raw => raw.replace(/[^A-Za-z0-9_:-]/g, '_');
    const uniqueId = base => {
      let id = safeId(base);
      if (!seenIds.has(id)) { seenIds.add(id); return id; }
      let n = 2;
      while (seenIds.has(`${id}_${n}`)) n++;
      const unique = `${id}_${n}`;
      seenIds.add(unique);
      return unique;
    };

    // Central user node
    nodes.push({ id: 'user', label: 'User', group: 'user', title: 'Central node' });
    seenIds.add('user');

    // Interests
    for (const interest of user.interests ?? []) {
      const id = uniqueId(`interest-${interest.topic}`);
      const pct = Math.round((interest.weight ?? 0) * 100);
      const humanLabel = resolveLabel(interest.topic);
      const isWikidata = interest.topic.startsWith('wikidata:');
      const qid = isWikidata ? interest.topic.slice('wikidata:'.length) : null;
      const description = qid ? (wikidataLabels[qid]?.description ?? '') : '';
      nodes.push({
        id,
        label: `${humanLabel}\n${pct}%`,
        group: 'interest',
        title: isWikidata
          ? `${humanLabel}${description ? ` — ${description}` : ''}\n(${interest.topic})`
          : `Interest: ${interest.topic}`,
        data: interest,
      });
      edges.push({ from: 'user', to: id, label: 'LIKES' });
    }

    // Beliefs (active only)
    for (const belief of kg.getActiveBeliefs()) {
      const id = uniqueId(`belief-${belief.topic}`);
      nodes.push({
        id,
        label: belief.topic,
        group: 'belief',
        title: `Belief: ${belief.claim}`,
        data: belief,
      });
      edges.push({ from: 'user', to: id, label: 'BELIEVES' });
    }

    // Identities (active only)
    for (const identity of kg.getActiveIdentities()) {
      const id = uniqueId(`identity-${identity.role}`);
      nodes.push({
        id,
        label: identity.role,
        group: 'identity',
        title: `Identity: ${identity.role}${identity.context ? ` (${identity.context})` : ''}`,
        data: identity,
      });
      edges.push({ from: 'user', to: id, label: 'IS' });
    }

    // Preferences (active only)
    for (const pref of kg.getActivePreferences()) {
      const id = uniqueId(`pref-${pref.type}-${pref.description}`);
      nodes.push({
        id,
        label: `${pref.type}\n${pref.description.slice(0, 20)}`,
        group: 'preference',
        title: `Preference: [${pref.type}] ${pref.description}`,
        data: pref,
      });
      edges.push({ from: 'user', to: id, label: 'PREFERS' });
    }

    res.json({ nodes, edges });
  } catch (err) {
    console.error('[profile-server] graph/nodes error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Graph Query (Cypher executor) ─────────────────────────────────────────────

app.post('/user-profile/graph/query', async (req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  try {
    const { query } = req.body ?? {};
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'body must include query string' });
      return;
    }
    const result = await executeQuery(marble.kg, query);
    res.json(result);
  } catch (err) {
    console.error('[profile-server] graph/query error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── Chat ──────────────────────────────────────────────────────────────────────

app.post('/user-profile/chat', async (req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
    return;
  }

  try {
    const { messages } = req.body ?? {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'body must include messages array' });
      return;
    }

    const model = process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

    const result = await handleChat(marble.kg, messages, { apiKey, baseUrl, model });
    res.json(result);
  } catch (err) {
    console.error('[profile-server] chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Graph Debug ───────────────────────────────────────────────────────────────

app.get('/user-profile/graph/debug', (_req, res) => {
  if (!ready) {
    res.status(503).json({ error: 'not ready' });
    return;
  }

  try {
    const kg = marble.kg;
    res.json({
      user: kg.user,
      kg_file: KG_FILE,
      ready,
    });
  } catch (err) {
    console.error('[profile-server] debug error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[profile-server] listening on port ${PORT}`);
});
