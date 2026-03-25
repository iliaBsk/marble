# Architecture

## System Overview

Marble is built as a pipeline of composable modules. Each module can run independently, but together they form a feedback loop that gets smarter daily.

```
Signals In → KG Processing → Hypothesis Testing → Multi-Agent Scoring → Delivery → Feedback Loop
```

## Data Flow

### 1. Signal Ingestion

Three layers of signals feed the system:

**World Signals (~80% of ranking power)**
- Google Trends topic spikes
- HackerNews score velocity
- Reddit upvote patterns
- Funding news, app rankings

**Sector Signals (~15%)**
- Industry forum activity
- Competitor mentions
- Ecosystem changes

**Personal Signals (~5%)**
- Dwell time on stories
- Scroll depth
- Forwards and replies
- Silence patterns (no engagement = implicit negative)

### 2. Knowledge Graph Processing

When a signal arrives, `kg.js` doesn't just increment a weight — it generates hypotheses:

```
Signal: User dwelled 45s on "AI code review tools"
  → Hypothesis: "User evaluating dev tools for team" (confidence: 0.4)
  → Hypothesis: "User interested in AI productivity" (confidence: 0.6)
  → Cross-reference: Previously clicked 3 hiring articles
  → Updated hypothesis: "User scaling engineering team" (confidence: 0.7)
```

### 3. Clone Simulation

The `clone.js` module creates a digital twin — a snapshot of the user's interests, patterns, context, and source trust. The `evolution.js` engine spawns N variants of this clone with slightly different weight configurations.

```
Generation 1: 10 clones with random weight mutations
  → Each scores 100 stories
  → User's actual behavior reveals which clones predicted correctly
  → Kill bottom 20%
  → Mutate survivors
  → Spawn new variants
Generation 2: Surviving clones are slightly more accurate
  ...
Generation 14: Clones have converged on real preferences
```

### 4. Multi-Agent Scoring (Swarm)

Five specialized agents evaluate stories through different lenses:

- **Career (25%)** — Professional growth, project relevance
- **Timing (25%)** — Calendar awareness, deadline proximity
- **Serendipity (20%)** — Unexpected delight, cross-domain discovery
- **Growth (15%)** — Adjacent interests, emerging fields
- **Contrarian (15%)** — What everyone else is missing

Each agent scores independently. Weighted consensus produces the final ranking.

The swarm is relationship-aware: agents factor in family schedules (school pickup at 3pm), partner timing (evening couple time), and seasonal patterns (summer outdoor activities, back-to-school).

### 5. Narrative Arc Reranking

Top-scored stories are resequenced for narrative flow. Position 1 (Opener) through Position 10 (Closer) follow a story arc pattern designed for engagement:

```
Opener → Bridge → Deep Dives → Pivot (surprise) → Practical → Horizon → Personal → Closer
```

### 6. Delivery & Signal Collection

Stories reach users through Telegram, Email, JSON API, or Webhooks. Each channel tracks engagement signals (opens, clicks, dwell time, forwards, silence) that feed back into the KG.

### 7. Evolution Loop

Daily cycle:
1. Collect all signals from previous day
2. Evaluate clone fitness against actual behavior
3. Kill bottom 20% of clone population
4. Mutate survivors, spawn new variants
5. Update KG hypotheses with confirmed/denied predictions
6. Observer tracks KPIs and alerts on degradation

## Module Dependencies

```
embeddings.js ← scorer.js ← index.js (main entry)
                    ↑
kg.js ← clone.js ← swarm.js
  ↑        ↑
  └── signals.js
  └── evolution.js
         ↑
      observer.js (monitors everything)

adapters/sources/ → index.js → adapters/delivery/
                        ↑
              adapters/signals/world.js
```

## Key Design Decisions

**User-centric KG**: The user is the root node, not entities. Every story is scored by distance to what matters to the user right now.

**Implicit over explicit**: No rating buttons. Learn from behavior. Silence is a signal.

**Local-first**: Core scoring uses ONNX embeddings locally. No API keys required. LLM is optional for enhanced reasoning.

**Evolutionary convergence**: Instead of tuning one model, evolve a population. Surviving clones represent the best approximation of the real user.

**Hypothesis-driven**: Every data point generates testable hypotheses. The system doesn't just track "user likes AI" — it asks "why does this user click on AI articles at 9am but not 3pm?"
