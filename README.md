# Marble

![Version](https://img.shields.io/badge/version-0.1.0-blue) ![Node](https://img.shields.io/badge/node-18+-green)

**Content scoring and decision compression engine.**

Marble implements a user-centric knowledge graph for content ranking and decision prioritization. It combines interest modeling, temporal context, and feedback learning to deliver highly relevant content scoring. Built for content curation, information filtering, and executive decision support systems.

---

## Approach

Marble implements a personalization system that differs from collaborative filtering by:

- **Context integration** — considers calendar events, active projects, and recent activity
- **Temporal scoring** — weights content relevance based on current user context
- **Semantic matching** — uses embeddings for conceptual similarity detection
- **User-specific modeling** — builds individual preference models without user-to-user comparison
- **Feedback loops** — adjusts scoring based on user reactions over time

**Core capabilities:** Advanced content scoring, decision compression, and personalized information filtering.

---

## Quick Start

```javascript
import { KnowledgeGraph, Scorer, Clone } from './core/marble';

// Initialize with user data
const kg = new KnowledgeGraph('./data/user.json');
await kg.load();

// Set today's context
kg.setContext({
  calendar: ['product demo', 'investor meeting'],
  active_projects: ['shopify app', 'user onboarding'],
  recent_conversations: ['pricing strategy', 'technical debt']
});

// DECISION COMPRESSION: Turn information overload into clear action
const decisionEngine = new Scorer(kg, { mode: 'decision_compression' });
const decisions = await decisionEngine.compress({
  inputs: [...emails, ...slackMessages, ...reports],
  output: 'what_matters_why_do_next'
});

console.log(`Critical: ${decisions.critical[0].matter}`);
console.log(`Why: ${decisions.critical[0].why}`);
console.log(`Do next: ${decisions.critical[0].do_next}`);

// CONTENT CURATION: Personalized story ranking
const contentScorer = new Scorer(kg, { mode: 'content_curation' });
const rankedStories = await contentScorer.score(rawStories);

console.log(rankedStories[0].story.title);
console.log(`Because: ${rankedStories[0].why}`);

// Record reaction to improve future recommendations
kg.recordReaction(itemId, 'up', ['relevant', 'actionable'], 'email');
await kg.save();
```

---

## Core Components

| Component | Purpose | Key Methods |
|-----------|---------|-------------|
| **[KnowledgeGraph](docs/api-reference.md#knowledgegraph)** | User interest tracking with temporal decay | `recordReaction()`, `getInterestWeight()`, `setContext()` |
| **[Scorer](docs/api-reference.md#scorer)** | Story ranking with multi-dimensional scoring | `score()`, Interest + Temporal + Novelty + Action + Trust |
| **[Clone](docs/api-reference.md#clone)** | Digital twin for reaction simulation | `takeSnapshot()`, `simulateReaction()` |
| **[Evolution](docs/api-reference.md#evolution)** | Adaptive learning and optimization | `evolveWeights()`, `findOptimalParameters()` |
| **[Swarm](docs/api-reference.md#swarm)** | Multi-agent content processing | `processStories()`, `diversifySelection()` |

---

## Documentation

| Guide | Description |
|-------|-------------|
| **[Installation & Setup](docs/installation.md)** | Requirements, npm install, configuration |
| **[Usage Examples](docs/usage-examples.md)** | Real integration patterns for startups |
| **[How It Works](docs/how-it-works.md)** | Data synthesis process explained simply |
| **[API Reference](docs/api-reference.md)** | Complete method documentation |
| **[Configuration](docs/configuration.md)** | Scoring weights, arc slots, customization |
| **[Architecture](docs/architecture.md)** | System design and component relationships |
| **[Performance](docs/performance.md)** | Benchmarks, optimization, scaling |
| **[Migration Guide](docs/migration-guide.md)** | Upgrading from Prism to Marble |
| **[Troubleshooting](docs/troubleshooting.md)** | Common issues and solutions |

---

## Scoring Dimensions

Marble uses five weighted dimensions to compute relevance scores:

```javascript
const SCORE_WEIGHTS = {
  interest_match: 0.25,      // Topic relevance to user interests
  temporal_relevance: 0.30,  // Relevance to current user context
  novelty: 0.20,            // Content freshness and uniqueness
  actionability: 0.15,       // Practical utility for current tasks
  source_trust: 0.10        // Historical source quality
};
```

**Design rationale:** Temporal relevance receives the highest weight because current context drives immediate decision-making. Interest match provides the foundation, while novelty and actionability ensure fresh, useful content delivery.

---

## Narrative Arc Positioning

Stories are arranged in a 10-slot narrative arc for optimal engagement:

```
1. OPENER    → High energy, attention-grabbing
2. BRIDGE    → Transition to substance
3. DEEP_1    → First deep-dive
4. DEEP_2    → Second deep-dive
5. PIVOT     → Change of pace / surprise
6. DEEP_3    → Third deep-dive
7. PRACTICAL → Actionable / how-to
8. HORIZON   → Future-looking
9. PERSONAL  → Close to home (local, relationships)
10. CLOSER   → Warm, human, memorable
```

---

## Data Types

### Story
```javascript
{
  id: "story_123",
  title: "OpenAI releases GPT-5",
  summary: "New multimodal model with improved reasoning",
  source: "techcrunch",
  url: "https://...",
  topics: ["ai", "openai", "llm"],
  published_at: "2024-03-25T10:00:00Z",
  valence: "inspiring",     // 'inspiring'|'alarming'|'neutral'|'fun'
  actionability: 0.7        // 0-1, optional
}
```

### ScoredStory
```javascript
{
  story: { /* Story object */ },
  composite_score: 0.85,     // Weighted combination of all dimensions
  interest_match: 0.9,
  temporal_relevance: 0.8,
  novelty: 0.7,
  actionability: 0.6,
  source_trust: 0.8,
  arc_position: 3,           // 1-10, narrative positioning (experimental)
  explanation: "High relevance to current projects and interests"
}
```

---

## Integration Examples

### Executive Decision Dashboard
```javascript
// Daily decision compression for knowledge workers
const decisions = await decisionEngine.compress({
  inputs: [...emails, ...slackMessages, ...reports, ...notifications],
  context: user.currentProjects,
  timeframe: 'today'
});
const dashboard = { critical: decisions.critical, defer: decisions.defer };
```

### News App
```javascript
// Morning briefing with contextual ranking
const briefing = await contentScorer.score(todaysStories);
const top10 = briefing.slice(0, 10);
```

### Newsletter Platform
```javascript
// Personalized newsletter generation
const clone = new Clone(kg);
clone.takeSnapshot();

const personalizedContent = await swarm.processStories(stories, clone);
```

### Enterprise Decision API
```javascript
// Decision prioritization endpoint
app.get('/api/decisions', async (req, res) => {
  const kg = await loadUserKG(req.user.id);
  const compressed = await decisionEngine.compress(req.body.inputs);
  res.json({
    prioritized: compressed.critical,
    total_items: req.body.inputs.length,
    filtered_count: compressed.critical.length
  });
});
```

---

## Advanced Features

### Semantic Matching
Uses embeddings to match conceptually similar content even with different keywords.

### Interest Decay
Interests naturally decay over time (14-day half-life) unless reinforced by positive reactions.

### Source Trust
Builds trust scores for content sources based on user reaction patterns.

### Digital Twin
Clone can simulate user reactions for content pre-filtering and A/B testing.

### Multi-Agent Processing
Swarm intelligence for diverse content selection and quality control.

---

## Requirements

- Node.js 18+
- 512MB RAM minimum (2GB recommended for embeddings)
- Optional: OpenAI API key for semantic matching

---

## Installation

```bash
npm install marble-engine
# or from source
git clone https://github.com/username/marble.git
cd marble
npm install
```

See [Installation Guide](docs/installation.md) for detailed setup instructions.

---

## Performance

Marble delivers fast content scoring with efficient resource usage:

- **Scoring Speed:** ~1000 stories/second on modern hardware (M1 Mac tested)
- **Memory Usage:** 100-500MB depending on embedding cache configuration
- **Cold Start:** Immediate functionality with smart defaults for new users
- **Storage:** Lightweight JSON persistence with SQLite scaling options

See [Performance Guide](docs/performance.md) for optimization strategies and benchmarking details.

---

## Migration from Prism

Marble is the evolved version of Prism with improved semantic matching and multi-agent processing.

```javascript
// Prism → Marble migration
const kg = new KnowledgeGraph('./prism-data.json');  // Same format
const scorer = new Scorer(kg);  // Enhanced scoring algorithm
```

See [Migration Guide](docs/migration-guide.md) for step-by-step instructions.

---

## Development

```bash
# Run tests
npm test

# Start development mode
npm run dev

# Test scoring pipeline
node test-marble-scoring.js

# Benchmark performance
npm run benchmark
```

---

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/username/marble/issues)
- 💬 [Discussions](https://github.com/username/marble/discussions)
- 📧 Email: support@marble-engine.com

---

**Content scoring engine with user-centric knowledge graphs. Built for personalized information filtering and decision compression.**