#!/usr/bin/env node
/**
 * bootstrap-alex.mjs — Seed Marble KG for Alex using InvestigativeCommittee
 *
 * Clears any existing KG and rebuilds from ground truth.
 * Data sources: Charlie memory files (local), Obsidian vault notes.
 *
 * Usage:
 *   node scripts/bootstrap-alex.mjs
 *   node scripts/bootstrap-alex.mjs --dry-run   # show questions without saving
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const KG_PATH = path.join(ROOT, 'data', 'kg', 'alex.json');
const DRY_RUN = process.argv.includes('--dry-run');

// ── LLM provider (DeepSeek local or Claude fallback) ──────────────────
async function llmCall(prompt) {
  // Try DeepSeek first (local, Tailscale)
  try {
    const res = await fetch('http://vad-serv-1.tail5fdf86.ts.net:13451/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-r1:14b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const j = await res.json();
      return j.choices?.[0]?.message?.content || '';
    }
  } catch {
    // fall through to Claude
  }

  // Fallback: Claude via env
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No LLM available — DeepSeek unreachable and ANTHROPIC_API_KEY not set');

  const { Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

// ── Data sources ───────────────────────────────────────────────────────

const MEMORY_DIR = path.resolve(process.env.HOME, '.config/meridian/profiles/default/projects/-Users-aleksandrshrestha/memory');
const OBSIDIAN_DIR = path.resolve(process.env.HOME, 'Documents/charlie');

function readDirText(dir, maxFiles = 20) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).slice(0, maxFiles);
  for (const file of files) {
    try {
      results.push({ file, content: fs.readFileSync(path.join(dir, file), 'utf8') });
    } catch { /* skip */ }
  }
  return results;
}

function buildSearchFn(documents) {
  return async (query) => {
    const q = query.toLowerCase();
    const hits = [];
    for (const { file, content } of documents) {
      // Score by keyword overlap
      const words = q.split(/\s+/).filter(w => w.length > 3);
      const matches = words.filter(w => content.toLowerCase().includes(w));
      if (matches.length > 0) {
        // Extract surrounding context
        const lines = content.split('\n');
        const relevant = lines.filter(l => matches.some(w => l.toLowerCase().includes(w)));
        hits.push(`[${file}] ${relevant.slice(0, 3).join(' | ')}`);
      }
    }
    return hits.slice(0, 8);
  };
}

// ── Seed facts ─────────────────────────────────────────────────────────

const ALEX_SEED = {
  id: 'alex',
  dob: '1988-11-02',
  interests: [
    { topic: 'LLMs / Generative AI', weight: 0.92, trend: 'rising' },
    { topic: 'AI Agents & Orchestration', weight: 0.91, trend: 'rising' },
    { topic: 'Entrepreneurship / Indie Hacking', weight: 0.90, trend: 'stable' },
    { topic: 'Revenue & Monetisation', weight: 0.95, trend: 'rising' },
    { topic: 'SaaS / Product Building', weight: 0.88, trend: 'rising' },
    { topic: 'Growth Marketing', weight: 0.80, trend: 'stable' },
    { topic: 'Shopify / E-commerce', weight: 0.78, trend: 'rising' },
    { topic: 'Cold Email / Outreach', weight: 0.75, trend: 'stable' },
    { topic: "Men's Coaching / Psychology", weight: 0.68, trend: 'stable' },
    { topic: 'Fitness & Biohacking', weight: 0.65, trend: 'rising' },
    { topic: 'Logistics & Trade', weight: 0.55, trend: 'stable' },
    { topic: 'Crypto / Web3', weight: 0.45, trend: 'stable' },
  ].map(i => ({ ...i, last_boost: new Date().toISOString() })),
  context: {
    calendar: [],
    active_projects: ['AhaRoll', 'SuperstateX', 'BooRadar', 'Vivo', 'Marble'],
    recent_conversations: [],
    mood_signal: null,
    location: 'Barcelona',
  },
  history: [],
  source_trust: {},
  beliefs: [
    { topic: 'building', claim: 'Ship fast, learn from real users — not from planning', strength: 0.9, evidence_count: 1 },
    { topic: 'AI', claim: 'AI agents will replace most solo founder execution within 2 years', strength: 0.85, evidence_count: 1 },
  ],
  preferences: [
    { type: 'work_style', description: 'Prefers systems thinking + delegation over manual execution', strength: 0.85 },
    { type: 'content', description: 'Direct, no-fluff communication — skips pleasantries', strength: 0.9 },
  ],
  identities: [
    { role: 'multi-venture founder', context: 'Barcelona, 5-month runway', salience: 1.0 },
    { role: 'builder', context: 'AI tools, consumer apps', salience: 0.9 },
  ],
  confidence: { AI: 0.9, marketing: 0.75, logistics: 0.6, coaching: 0.65 },
  clones: [],
};

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Marble Bootstrap: Alex ===\n');

  // Load data sources
  const memoryDocs = readDirText(MEMORY_DIR);
  const obsidianDocs = readDirText(OBSIDIAN_DIR);
  console.log(`Loaded ${memoryDocs.length} memory files, ${obsidianDocs.length} Obsidian files`);

  const allDocs = [...memoryDocs, ...obsidianDocs];
  const searchFn = buildSearchFn(allDocs);

  // Initialise KG with seed
  const kgData = {
    user: ALEX_SEED,
    _dimensionalPreferences: [],
    updated_at: new Date().toISOString(),
  };

  // Dynamically import InvestigativeCommittee
  const { InvestigativeCommittee } = await import('../core/investigative-committee.js');

  // Build a minimal KG wrapper for the committee
  // Method names must match what InvestigativeCommittee._buildKGSnapshot() calls:
  //   getActiveBeliefs(), getActivePreferences(), getActiveIdentities(), getInsights()
  //   addBelief(key, value, confidence), addPreference(key, value), addIdentity(role, value)
  const kgProxy = {
    user: kgData.user,
    // Read methods (called by _buildKGSnapshot)
    getActiveBeliefs: () => kgData.user.beliefs.map(b => ({
      topic: b.topic,
      value: b.claim,
      confidence: b.strength,
    })),
    getActivePreferences: () => kgData.user.preferences.map(p => ({
      category: p.type,
      value: p.description,
    })),
    getActiveIdentities: () => kgData.user.identities.map(i => ({
      role: i.role,
      value: i.context,
    })),
    getInsights: () => [],
    // Write methods (called after investigation)
    addBelief: (key, value, confidence = 0.75) => {
      kgData.user.beliefs.push({ topic: key, claim: value, strength: confidence, evidence_count: 1 });
    },
    addPreference: (key, value) => {
      kgData.user.preferences.push({ type: key, description: value, strength: 0.7 });
    },
    addIdentity: (role, value) => {
      kgData.user.identities.push({ role, context: value, salience: 0.7 });
    },
    addClone: (c) => kgData.user.clones.push(c),
  };

  const MAX_ROUNDS = parseInt(process.env.ROUNDS || '1');
  const committee = new InvestigativeCommittee(kgProxy, llmCall, {
    maxRounds: MAX_ROUNDS,
    maxQuestionsPerRound: 4,
  });
  committee.registerSource('charlie-memory', searchFn);

  console.log(`\nRunning investigative loop (${MAX_ROUNDS} round(s))...\n`);
  try {
    const result = await committee.investigate(MAX_ROUNDS);
    console.log(`\nInvestigation complete:`);
    console.log(`  Questions answered: ${result.answered}`);
    console.log(`  Knowledge gaps: ${result.gaps.length}`);
    if (result.gaps.length) {
      console.log('\nGaps (clone hypotheses):');
      result.gaps.forEach((g, i) => console.log(`  ${i + 1}. ${g}`));
    }
  } catch (err) {
    console.error('Investigation error:', err.message);
    console.log('Continuing with seed data only...');
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] KG not saved.');
    return;
  }

  // Save
  fs.mkdirSync(path.join(ROOT, 'data', 'kg'), { recursive: true });
  fs.writeFileSync(KG_PATH, JSON.stringify(kgData, null, 2));
  console.log(`\n✓ KG saved to ${KG_PATH}`);
  console.log(`  Interests: ${kgData.user.interests.length}`);
  console.log(`  Beliefs: ${kgData.user.beliefs.length}`);
  console.log(`  Clones: ${kgData.user.clones.length}`);
}

main().catch(console.error);
