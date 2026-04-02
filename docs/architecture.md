# Architecture Guide

## System Overview

Marble follows a **modular, stateless architecture** with clear separation between user modeling, content scoring, and data persistence.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Marble Architecture                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────┐   ┌──────────────────┐   ┌────────────────────┐ │
│  │   Raw Items   │──▶│   Enrichment     │──▶│  Scored Results    │ │
│  │   (any type)  │   │   Layer          │   │  (magic_score)     │ │
│  └───────────────┘   └──────┬───────────┘   └────────────────────┘ │
│                             │                        ▲              │
│                             ▼                        │              │
│                    ┌──────────────────┐    ┌──────────────────┐    │
│                    │ Knowledge Graph  │───▶│     Scorer       │    │
│                    │  (user model)    │    │  (multi-dim)     │    │
│                    └────────┬─────────┘    └──────────────────┘    │
│                             │                        ▲              │
│                             ▼                        │              │
│                    ┌──────────────────┐    ┌──────────────────┐    │
│                    │ Pattern Detector │───▶│ Calibration API  │    │
│                    │  (cross-item)    │    │  (auto-tune)     │    │
│                    └──────────────────┘    └──────────────────┘    │
│                             │                                      │
│                             ▼                                      │
│                    ┌──────────────────┐                            │
│                    │ Persistent Store │                            │
│                    │   (JSON files)   │                            │
│                    └──────────────────┘                            │
└──────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Knowledge Graph (`kg.js`)
**Responsibility**: User modeling and state management

```javascript
class KnowledgeGraph {
  // User state management
  load()              // Load from disk
  save()              // Persist to disk

  // Interest modeling
  getInterestWeight() // Get current interest (with decay)
  boostInterest()     // Positive feedback
  decayInterest()     // Negative feedback

  // Context management
  setContext()        // Update daily context

  // History tracking
  recordReaction()    // Log user interaction
  hasSeen()          // Check if story shown before

  // Source trust
  getSourceTrust()    // Get source credibility
}
```

**Key Features**:
- Automatic interest decay (14-day half-life)
- Context-aware relevance
- Source trust learning
- Anti-staleness (no duplicate stories)

### 2. Scorer (`scorer.js`)
**Responsibility**: Multi-dimensional story ranking

```javascript
class Scorer {
  score(stories)      // Rank stories by magic_score

  // Private scoring methods
  #interestMatch()    // Topic similarity
  #temporalRelevance()// Context awareness
  #noveltyScore()     // Filter bubble prevention
  #actionability()    // Can user act on this?
  #sourceTrust()      // Source credibility
  #freshnessDecay()   // Recency bias
}
```

**Scoring Pipeline**:
1. **Interest Match**: Semantic similarity to user interests
2. **Temporal Relevance**: Relevance to today's context
3. **Novelty**: Exposure to new topics
4. **Actionability**: Practical utility
5. **Source Trust**: Historical source performance
6. **Freshness**: Recency multiplier

### 3. Types (`types.js`)
**Responsibility**: Type definitions and constants

- **Story/ScoredStory**: Data schemas
- **UserNode/InterestEdge**: User model structure
- **SCORE_WEIGHTS**: Dimension weightings
- **ARC_SLOTS**: Narrative positioning

### 4. Embeddings (`embeddings.js`)
**Responsibility**: Semantic similarity calculations

```javascript
class EmbeddingEngine {
  getSimilarity(text1, text2)  // Cosine similarity
  embed(text)                  // Generate embeddings
  enableCache(path)            // Persistent caching
}
```

**Features**:
- OpenAI embeddings (with local fallback)
- Persistent disk cache
- Cosine similarity calculations
- Graceful degradation to string matching

### 5. Item Enrichment Layer

The enrichment layer extracts deep, preference-predictive attributes from items — going far beyond basic metadata like genre or author. It operates through three cooperating components:

#### Entity Extractor (`entity-extractor.js`)
**Responsibility**: Synchronous, metadata-driven attribute extraction

```javascript
extractEntityAttributes(item)
// Returns: { domain: string, attributes: { [kgKey]: Array<{value, kgKey, kgType, attribute}> } }
```

- **Domain detection**: Infers item type (movie, music, book, article, restaurant) from metadata fields — no hardcoded type registry
- **Field-to-KG mapping**: Maps common metadata fields (director, genre, pacing, themes, cuisine, etc.) to KG node types via `FIELD_KG_MAP`
- **Text extraction**: Falls back to parsing title/summary for year→era, genre keywords, and theme keywords when structured metadata is absent
- Called **synchronously** from `kg.recordReaction()` on every user reaction

#### Topic Insight Engine (`topic-insight-engine.js`)
**Responsibility**: LLM-powered deep dimension discovery

```javascript
class TopicInsightEngine {
  analyse(item, reaction, kg)      // Main entry: extract → gap-check → simulate → write
  extractDimensions(item)          // LLM or heuristic dimension extraction
}
```

- **Self-questioning loop**: Asks the LLM "what dimensions predict preference for THIS item?" — no pre-defined schema
- Each dimension is typed: `{ id, label, value, kgType: 'belief'|'preference'|'identity' }`
- Checks KG for existing evidence before generating new hypotheses
- Writes surviving hypotheses as typed KG nodes (beliefs, preferences, identities)
- Called **asynchronously** (fire-and-forget) from `kg.recordReaction()` when attached

#### Gap Simulator (`topic-insight-engine.js`)
**Responsibility**: Hypothesis generation for unknown preference dimensions

```javascript
class GapSimulator {
  simulate(item, gaps, ratedHistory, reaction)
  // Returns: Array<{dimensionId, value, kgType, confidence, reasoning}>
}
```

- For dimensions with **no existing KG evidence**, generates plausible hypotheses about user preferences
- Cross-checks hypotheses against rated history to eliminate contradictions
- Confidence scores: 0.2–0.4 with little history, 0.5–0.8 with corroborating evidence
- Has both LLM-powered and heuristic fallback paths

#### Integration Flow

```
User reacts to item
    │
    ├──▶ extractEntityAttributes(item)          [sync, entity-extractor.js]
    │       └──▶ KG.#trackDimensionalPreferences()
    │
    └──▶ TopicInsightEngine.analyse(item, reaction, kg)  [async, fire-and-forget]
            ├──▶ extractDimensions(item)         [LLM or heuristic]
            ├──▶ Check KG for existing evidence
            ├──▶ GapSimulator.simulate()         [for unknown dimensions]
            ├──▶ Write hypotheses as KG nodes
            └──▶ Reinforce known dimensions
```

- **Sync path** (entity-extractor): fast, metadata-only, runs on every reaction
- **Async path** (TopicInsightEngine): deeper, LLM-powered, fire-and-forget
- Both paths converge in the KG — enrichment results feed into the `attribute_pattern_match` scoring dimension

### 6. Evolution (`evolution.js`)
**Responsibility**: User model adaptation over time

- Interest drift detection
- Long-term preference learning
- Model stability maintenance

## Data Flow

### 1. Story Ingestion
```
External APIs ───┐
RSS Feeds    ───┼──▶ Raw Stories Array
Web Scrapers ───┘
```

### 2. Scoring Process
```
Raw Stories ──▶ Scorer.score() ──┐
                      │          │
                      ▼          ▼
            KnowledgeGraph ─▶ ScoredStories
                      │
                      ▼
            Interest Matching
            Temporal Analysis
            Novelty Injection
            Trust Weighting
```

### 3. User Feedback Loop
```
User Reaction ──▶ KG.recordReaction() ──▶ Interest Updates
      │                                        │
      ▼                                        ▼
Story Metadata                         Source Trust Updates
(topics, source)                            │
                                           ▼
                                    Persistent Storage
```

## Storage Architecture

### File Structure
```
data/marble/
├── alex.json           # User knowledge graph
├── beta-user.json      # Another user
└── ...

data/cache/
├── embeddings/         # Semantic similarity cache
│   ├── topic-pairs.json
│   └── embeddings.json
└── ...
```

### User Model Schema
```javascript
{
  "id": "alex",
  "interests": [
    {
      "topic": "artificial-intelligence",
      "weight": 0.85,
      "last_boost": "2026-03-24T10:30:00Z",
      "trend": "rising"
    }
  ],
  "context": {
    "calendar": ["investor pitch at 2pm"],
    "active_projects": ["marble-launch"],
    "recent_conversations": ["ai-funding", "product-market-fit"]
  },
  "history": [
    {
      "story_id": "story-123",
      "reaction": "up",
      "date": "2026-03-24T09:15:00Z",
      "topics": ["ai", "startups"],
      "source": "techcrunch"
    }
  ],
  "source_trust": {
    "techcrunch": 0.78,
    "hackernews": 0.65
  }
}
```

## Scalability Considerations

### Single User Performance
- **Stories/sec**: ~5000 stories scored per second
- **Memory footprint**: ~50MB per user (10K interactions)
- **Disk usage**: ~10KB per user profile

### Multi-User Scaling
```
Load Balancer ──┐
                ├──▶ Scorer Instance 1 ──▶ User KG Cache
                ├──▶ Scorer Instance 2 ──▶ User KG Cache
                └──▶ Scorer Instance N ──▶ User KG Cache
                            │
                            ▼
                    Shared Embeddings Cache
                            │
                            ▼
                    Persistent Storage Layer
```

### Caching Strategy
- **User models**: In-memory LRU cache (1000 users)
- **Embeddings**: Persistent disk cache
- **Story metadata**: Redis cache for frequently accessed stories

## Security & Privacy

### Data Minimization
- Only store necessary user interaction data
- Automatic history trimming (500 most recent reactions)
- No storage of story content (only metadata)

### Isolation
- Each user model is independently stored
- No cross-user data leakage
- Stateless scoring (no shared state between users)

## Integration Patterns

### API Integration
```javascript
// RESTful scoring endpoint
POST /api/score
{
  "user_id": "alex",
  "stories": [...],
  "context": {...}
}

// Response
{
  "ranked_stories": [...],
  "user_insights": {...}
}
```

### Event-Driven Integration
```javascript
// Reaction webhook
POST /api/react
{
  "user_id": "alex",
  "story_id": "story-123",
  "reaction": "up"
}
```

### Batch Processing
```javascript
// Bulk user update
POST /api/bulk-score
{
  "users": ["alex", "beta-user"],
  "stories": [...],
  "async": true
}
```

## Monitoring & Observability

### Key Metrics
- **Scoring latency**: p95, p99 response times
- **User engagement**: Reaction rates, session length
- **Model accuracy**: Predicted vs actual reactions
- **Cache hit rates**: Embeddings, user models

### Health Checks
- User model loading/saving success rates
- Embedding service availability
- Disk space for user data
- Memory usage per user model

This architecture provides a solid foundation for building personalized content experiences at scale while maintaining simplicity and explainability.