/**
 * run-insight-committee.mjs — CI runner for the Marble psychological probe committee.
 *
 * Loads the KG (from --kg path or test fixture), runs runInsightSwarm powered by
 * DeepSeek, and prints a structured report.  Exits non-zero on hard failure.
 *
 * Usage:
 *   node scripts/run-insight-committee.mjs
 *   node scripts/run-insight-committee.mjs --kg /path/to/kg.json
 *
 * Env vars:
 *   LLM_PROVIDER=deepseek            (default for this script)
 *   DEEPSEEK_BASE_URL                self-hosted endpoint, e.g. https://vad-serv-1.tail5fdf86.ts.net
 *   DEEPSEEK_API_KEY                 x-api-key for the self-hosted endpoint
 *   MARBLE_LLM_MODEL                 model override, e.g. deepseek-r1:14b
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Force DeepSeek unless caller overrides
if (!process.env.LLM_PROVIDER) process.env.LLM_PROVIDER = 'deepseek';

const { KnowledgeGraph } = await import('../core/kg.js');
const { runInsightSwarm } = await import('../core/insight-swarm.js');

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const kgPathArg = args.includes('--kg') ? args[args.indexOf('--kg') + 1] : null;

const KG_CANDIDATES = [
  kgPathArg,
  resolve(REPO_ROOT, 'examples/data/quickstart-kg.json'),
  resolve(REPO_ROOT, 'test/test-kg.json'),
].filter(Boolean);

// ── Load KG ──────────────────────────────────────────────────────────────────

async function loadKG() {
  for (const p of KG_CANDIDATES) {
    try {
      const kg = new KnowledgeGraph(p);
      await kg.load();
      if (kg.user?.id) {
        console.log(`[committee] KG loaded from ${p} (user: ${kg.user.id})`);
        return kg;
      }
    } catch {
      // try next
    }
  }
  throw new Error('No valid KG file found. Provide --kg /path/to/kg.json or add test/test-kg.json.');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Config check
  const provider = process.env.LLM_PROVIDER;
  const baseURL   = process.env.DEEPSEEK_BASE_URL;
  const apiKey    = process.env.DEEPSEEK_API_KEY;
  const model     = process.env.MARBLE_LLM_MODEL || 'deepseek-r1:14b';

  if (provider === 'deepseek' && !baseURL) {
    console.error('[committee] ERROR: DEEPSEEK_BASE_URL is not set.');
    process.exit(1);
  }
  if (provider === 'deepseek' && !apiKey) {
    console.error('[committee] ERROR: DEEPSEEK_API_KEY is not set.');
    process.exit(1);
  }

  console.log(`[committee] Provider: ${provider}`);
  console.log(`[committee] Model:    ${model}`);
  if (baseURL) console.log(`[committee] Endpoint: ${baseURL}`);

  const kg = await loadKG();

  console.log('\n── Generating agent committee ──────────────────────────────');
  const startMs = Date.now();

  let insights;
  try {
    insights = await runInsightSwarm(kg, { model });
  } catch (err) {
    console.error('[committee] runInsightSwarm failed:', err.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log(`\n── Committee results (${insights.length} insights, ${elapsed}s) ────────────\n`);

  if (insights.length === 0) {
    console.error('[committee] FAIL: zero insights returned — something is wrong.');
    process.exit(1);
  }

  for (const [i, ins] of insights.entries()) {
    console.log(`[${i + 1}] Agent: ${ins.agent || 'unknown'} | Lens: ${ins.lens}`);
    console.log(`    Insight:  ${ins.insight}`);
    console.log(`    Question: ${ins.question}`);
    console.log(`    Conf: ${(ins.confidence * 100).toFixed(0)}%  L2-seed: ${ins.l2_seed}`);
    if (ins.supporting_facts?.length) {
      console.log(`    Data refs: ${ins.supporting_facts.join(', ')}`);
    }
    console.log('');
  }

  // Summary line for CI log scanning
  const l2Count = insights.filter(i => i.l2_seed).length;
  console.log(`── Summary: ${insights.length} total, ${l2Count} L2-seeds ────────────────────────`);
  console.log('[committee] PASS');
}

main().catch(err => {
  console.error('[committee] Unhandled error:', err);
  process.exit(1);
});
