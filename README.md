# Marble

**Hyper-personalized content curation through person synthesis and simulation.**

```javascript
import { Marble } from 'marble';
const marble = new Marble();
const top10 = await marble.select(stories, userContext);  // ranked + explained
```

Marble creates multiple simulated versions of a user, tests them against real-world signals, and learns which version predicts their actual behavior. No thumbs-up buttons needed.

## Why Marble?

Most curation works **outside-in** — "what does the crowd think?"

Marble works **person-first** — "test different versions of this person, see which fits best."

The world already votes on what matters (trending topics, viral posts, funding rounds). Marble synthesizes those signals with a deep model of the user to surface content that feels like: *"How did it know I needed to see this today?"*

## Quick Start

```bash
npm install marble
```

```javascript
import { Marble } from 'marble';

const marble = new Marble();
const topStories = await marble.select(stories, {
  interests: ['AI', 'startups'],
  calendar: ['investor call 14:00'],
  projects: ['newsletter platform']
});

topStories.forEach((story, i) => {
  console.log(`${i+1}. [${story.score.toFixed(3)}] ${story.title}`);
  console.log(`   Why: ${story.reasoning}`);
});
```

**Learn from engagement (no buttons needed):**

```javascript
// Explicit feedback
await marble.react('story-123', 'up', ['ai', 'productivity']);

// Implicit signals (dwell time, clicks, shares)
await marble.signal('story-456', 'dwell', { duration: 45000 });
```

**Run tests:**

```bash
git clone https://github.com/AlexShrestha/marble.git
cd marble && npm install && npm test
```

## Features

- **Zero API keys** — Core scoring runs locally with ONNX embeddings
- **Privacy-first** — All computation happens on your machine
- **Three modes** — Score (fast), Swarm (rich), WorldSim (B2B PMF)
- **Implicit learning** — Learns from dwell time, scroll depth, forwards, silence
- **Insight-driven KG** — Reasons about WHY, not just WHAT (see [docs/insight-kg.md](docs/insight-kg.md))
- **Relationship-aware** — Models the people in a user's life to improve recommendations
- **Narrative arc** — Stories sequenced for flow, not just ranked by score

## How It Works

```
┌──────────────────────────────────────────────────┐
│  1. GATHER                                        │
│  RSS, HN, NewsAPI + World Signals (trends,        │
│  search volume, social velocity)  ~100 stories    │
├──────────────────────────────────────────────────┤
│  2. SCORE / SWARM                                 │
│  Score: magic_score formula (embeddings-based)     │
│  Swarm: 5 agents evaluate through different lenses │
├──────────────────────────────────────────────────┤
│  3. ARC REORDER                                   │
│  Sequence into narrative flow (opener → closer)    │
├──────────────────────────────────────────────────┤
│  4. DELIVER                                       │
│  Telegram, Email, JSON API, Webhook, Video         │
├──────────────────────────────────────────────────┤
│  5. LEARN                                         │
│  Implicit signals → KG updates → Clone evolution   │
│  → Better predictions daily                        │
└──────────────────────────────────────────────────┘
```

### Three Modes

| Mode | What it does | Use case |
|------|-------------|----------|
| **Score** (v1) | Deterministic scoring against user KG | Fast, predictable, no API calls |
| **Swarm** (v2) | Multi-agent evaluation with 5 specialized lenses | Richer selection, catches what scoring misses |
| **WorldSim** (v3) | Population-level simulation for product-market fit | B2B — "which users for this product?" |

### The Magic Score

```
magic_score = interest(0.25) + temporal(0.30) + novelty(0.20)
            + actionability(0.15) + source_trust(0.10)
            × freshness_decay
```

- **Interest match (25%)** — Semantic similarity via local ONNX embeddings
- **Temporal relevance (30%)** — Is this relevant TODAY? (calendar, projects, deadlines)
- **Novelty (20%)** — Surprise factor (inverse topic frequency)
- **Actionability (15%)** — Can the user act on this?
- **Source trust (10%)** — Learned per-source credibility

### Swarm Agents

Five agents, each asking a different question:

| Agent | Weight | Question |
|-------|--------|----------|
| Career | 25% | "Will this help their business?" |
| Timing | 25% | "Does this matter TODAY specifically?" |
| Serendipity | 20% | "Would this delight them unexpectedly?" |
| Growth | 15% | "Will this stretch their thinking?" |
| Contrarian | 15% | "What is everyone else missing?" |

## Architecture

```
marble/
├── core/                 # The engine (standalone)
│   ├── index.js         # Main Marble class — select(), react(), save()
│   ├── kg.js            # Insight-driven knowledge graph (v2)
│   ├── scorer.js        # magic_score computation
│   ├── swarm.js         # Multi-agent curation (5 lenses)
│   ├── clone.js         # Digital twin — user snapshot for simulation
│   ├── evolution.js     # Clone population evolution
│   ├── signals.js       # Implicit signal detection
│   ├── arc.js           # Narrative arc reranking (10 slots)
│   ├── decay.js         # Exponential decay (14-day half-life)
│   ├── embeddings.js    # Local ONNX embeddings (384-dim)
│   └── types.js         # Type definitions, weights
│
├── web/                 # Web reader + signal tracker + dashboard
│   ├── reader.js        # Story page (tracks dwell, scroll, clicks)
│   ├── tracker.js       # Signal collection endpoint
│   └── dashboard.js     # User profile visualization
│
├── adapters/
│   ├── sources/         # RSS, HackerNews, NewsAPI
│   ├── delivery/        # Telegram, Email, API, Webhook
│   └── signals/         # World signals (trends, velocity)
│
├── worldsim/            # World Clone — B2B product-market fit
│   ├── archetypes.js    # Synthetic user population
│   ├── pmf.js           # PMF analysis engine
│   └── index.js         # WorldSim class
│
├── api/                 # REST API server
├── test/                # Test harness (30 stories)
├── examples/            # Integration examples
└── docs/                # Detailed documentation
    ├── architecture.md
    ├── api-reference.md
    ├── insight-kg.md
    ├── archetypes-relationships.md
    └── contributing.md
```

## Core Concepts

### Knowledge Graph (Insight-Driven)

Not a flat interest tracker. Marble's KG generates hypotheses about WHY a user cares about something, then tests those hypotheses with content.

```
         YOU (root)
        / | \   \
 projects interests people calendar
    |        |        |       |
"AhaRoll" "AI/web3" "Ilia" "call 14:00"
    |        |        |       |
[stories connecting to these nodes score higher]
```

Every signal triggers hypothesis generation, not just a weight increment. See [docs/insight-kg.md](docs/insight-kg.md) for the full deep-dive.

### Digital Twin (Clone)

A synthetic snapshot of the user for simulation. Captures weighted interests, behavioral patterns, today's context, and source trust. The evolution engine spawns N variants and kills the bottom 20% daily — survivors converge on real preferences within ~2 weeks.

### Narrative Arc

Top 10 stories aren't just ranked — they're sequenced:

| Position | Role | Purpose |
|----------|------|---------|
| 1 | Opener | High energy, attention-grabbing |
| 2 | Bridge | Transition to substance |
| 3-4 | Deep dives | Core insights |
| 5 | Pivot | Change of pace, surprise |
| 6 | Deep dive | Third substantive piece |
| 7 | Practical | Actionable, how-to |
| 8 | Horizon | Future-looking |
| 9 | Personal | Close to home |
| 10 | Closer | Warm, human, memorable |

### Signal Layers

No thumbs-up/down needed. Three layers of implicit feedback:

| Layer | Weight | Signals | User effort |
|-------|--------|---------|-------------|
| **World** | ~80% | Trends, search volume, social velocity | Zero |
| **Sector** | ~15% | Industry forums, competitor activity | Zero |
| **Personal** | ~5% | Dwell time, forwards, replies, silence | Passive |

## Integration Modes

### 1. Local-First (Recommended)

```javascript
const marble = new Marble({ mode: 'local' });
const results = await marble.select(stories, userContext);
```

### 2. Enhanced (Optional LLM)

```javascript
const marble = new Marble({
  mode: 'enhanced',
  llm: async (prompt) => await yourLLMProvider(prompt)
});
```

### 3. World Clone (B2B PMF)

```javascript
import { WorldSim } from 'marble/worldsim';
const worldsim = new WorldSim();
const pmf = await worldsim.simulate(yourProduct);
console.log(`PMF Score: ${pmf.pmf_score}/1.0`);
```

## Documentation

| Doc | What it covers |
|-----|---------------|
| [Installation & Setup](docs/installation.md) | Full setup guide, configuration, adapters, troubleshooting |
| [How It Works](docs/how-it-works.md) | The data synthesis process explained simply |
| [Architecture](docs/architecture.md) | Full system design, data flow, component interactions |
| [API Reference](docs/api-reference.md) | Every endpoint and function with examples |
| [Usage Examples](docs/usage-examples.md) | Real code showing how to integrate Marble |
| [Insight-Driven KG](docs/insight-kg.md) | How Marble reasons about WHY, not just WHAT |
| [Archetypes & Relationships](docs/archetypes-relationships.md) | Relationship simulation, archetype generation |
| [Contributing](docs/contributing.md) | How to contribute to Marble |

## License

MIT
