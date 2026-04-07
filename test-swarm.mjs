import { readFileSync } from 'fs';

// Load .env manually (no dotenv installed)
const envFile = new URL('.env', import.meta.url);
try {
  const lines = readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import { KnowledgeGraph } from './core/kg.js';
import { runInsightSwarm } from './core/insight-swarm.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kgPath = path.join(__dirname, 'data/kg/alex.json');

const kg = new KnowledgeGraph(kgPath);
await kg.load();

console.log('KG loaded. User:', kg.user?.id);
console.log('Running insight swarm...');

const insights = await runInsightSwarm(kg);
console.log('\n=== INSIGHTS ===');
console.log(JSON.stringify(insights, null, 2));
