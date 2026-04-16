# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Marble is a hyper-personalized content curation engine. It creates multiple synthetic "clones" of a user, scores content candidates against those clones, and evolves the clones toward the user's real preferences over time. It works from day zero (3 interactions) and runs entirely locally by default.

## Commands

```bash
# Run all tests
npm test

# Run a single test file
node --test test/scorer.test.js

# Start REST API server
npm start

# Web components
npm run web           # reader + signal tracker
npm run web:reader    # story page tracker only
npm run web:tracker   # signal collection endpoint
npm run web:dashboard # user profile visualization
```

No build step — pure JavaScript (ESM). No TypeScript, no compilation.

## Architecture

**Runtime**: Node.js 20+, `"type": "module"` (ESM throughout), native `node --test` runner.

**Entry point**: `core/index.js` — exports the `Marble` class, which is the only public API consumers touch.

### Core Pipeline

```
onboard(answers)     → wizard answers → deterministic KG seed + OpenAI deep research
init()               → load KG, attach engines
ingestConversations()→ mine chat exports (ChatGPT/Claude) into KG
select(items, ctx)   → score + clone consensus + optional arc reorder
react(item, reaction)→ record signal, extract entities, run TopicInsight
feedbackBatch(rxns)  → contrastive analysis on a full slate
learn()              → L1.5 swarm → L2 inference → L3 clone evolution
investigate(opts)    → adaptive committee fills knowledge gaps
```

### Key Modules (`core/`)

| Module | Role |
|--------|------|
| `kg.js` | KnowledgeGraph — typed memory nodes (beliefs, preferences, identities), 14-day interest half-life decay, reaction history |
| `scorer.js` | Deterministic scoring: `interest(0.25) + temporal(0.30) + novelty(0.20) + actionability(0.15) + source_trust(0.10) × freshness_decay` |
| `swarm.js` | Multi-agent v2 scoring — 5 lenses (Career, Timing, Serendipity, Growth, Contrarian) with debate |
| `clone.js` | Digital twin — synthetic user snapshot for simulation |
| `evolution.js` | Clone population — spawns variants, kills bottom 20% daily, converges on real prefs |
| `topic-insight-engine.js` | LLM-powered dimension discovery on every `react()` call |
| `entity-extractor.js` | Synchronous metadata extraction, domain detection, maps fields to KG |
| `arc.js` | Narrative arc reranker for newsletters (10-slot sequence: opener → closer) |
| `rapid-feedback.js` | Contrastive batch feedback analysis |
| `investigative-committee.js` | Adaptive committee with debate + psychological inference |
| `llm-provider.js` | Unified LLM client (Anthropic preferred, OpenAI/DeepSeek fallback, optional Ollama) |
| `embeddings.js` | Local ONNX (all-MiniLM-L6-v2, 384-dim, default) or OpenAI/DeepSeek embeddings |
| `collaborative-filter.js` | CF scoring blend — **must be awaited** (known historic bug) |
| `memory-layers.js` | Token-efficient KG assembly for LLM context |
| `calibration.js` / `calibration-api.js` | Auto-tuning weight system |

### Three Scoring Modes

- **Score (v1)**: `scorer.js` — deterministic, no API calls, fastest
- **Swarm (v2)**: `swarm.js` — 5-agent debate, richer but requires LLM
- **WorldSim (v3)**: `worldsim-bridge.js` — population simulation for B2B PMF

### Storage

No database. KG persists as JSON files. ChromaDB integration is optional for vector search.

### Environment

Copy `.env.example` to `.env`. Key variables:
- `ANTHROPIC_API_KEY` — preferred LLM
- `OPENAI_API_KEY` — fallback LLM + embeddings
- `EMBEDDINGS_PROVIDER` — `local` (default, no key needed), `openai`, or `deepseek`
- Source/delivery adapter flags (see `.env.example`)

### Other Directories

- `api/` — Express REST server; `api/server.js` is the `npm start` entry; `api/onboarding-server.js` mounts onboarding routes
- `core/onboarding/` — wizard schema, city→shops registry, step definitions, KG seed writer, OpenAI deep-research caller
- `web/` — Browser-side reader, signal tracker, dashboard
- `experimental/` — Archetype generator, relationship simulator, synthetic reasoner (not part of public API)
- `scripts/` — Bootstrap, KG inspection, insight committee runner
- `docs/` — Architecture deep-dives, API reference, how-it-works guides
- `examples/` — Quickstart and integration demos

### Onboarding Endpoints (POST `npm start` → `api/server.js`)

| Endpoint | Description |
|----------|-------------|
| `GET /onboarding/steps` | Wizard step definitions + known cities |
| `GET /onboarding/shops?city=` | Dynamic shop chips for a city |
| `POST /onboarding/submit` | One-shot onboarding (JSON response) |
| `POST /onboarding/submit/stream` | SSE streaming onboarding with progress events |

**Onboarding pipeline in `core/onboarding/`:**
- `schema.js` — validates `OnboardingAnswers`, exports enum constants
- `shops-registry.js` — `getShopsForCity(city)` static map (12 cities seeded)
- `steps.js` — declarative `STEPS` array consumed by both API and browser
- `to-kg.js` — pure `answersToKgSeed(answers)` → no network, fully testable
- `apply-to-kg.js` — `applyOnboardingToKg(kg, seed)` and `applyEnrichmentToKg(kg, enrichment)`; enrichment is capped at lower strength so real reactions dominate
- `deep-research.js` — `runDeepResearch(opts)` uses OpenAI Responses API with `web_search_preview`; accepts injected `client` for tests; 90s timeout, one JSON-parse retry
- Allergy beliefs use per-allergy topics (`dietary_restriction:gluten`) to avoid contradiction detection closing prior entries

## Important Conventions

- **Public API** is only what `core/index.js` exports. Everything else is internal; internal modules are not re-exported.
- `arcReorder` in `select()` is **opt-in** (not default).
- `react()` takes the full item object (not just an ID).
- `feedbackBatch()` replaced the old `reactSlate()`.
- KG field is `item_id` (was `story_id` before v0.1.0 rename).
- CF calls in `collaborative-filter.js` must always be `await`ed — a prior bug from missing `await` caused silent failures.
- `clone.toPrompt()` must be complete before passing to LLM — check this when modifying `clone.js`.
