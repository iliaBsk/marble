# How Marble Works

Technical explanation of Marble's content scoring and knowledge graph implementation.

---

## Overview

Marble implements a user-centric content scoring system that differs from collaborative filtering approaches. Rather than comparing users, it builds individual preference models using temporal context, interest tracking, and feedback learning.

**Collaborative filtering:** "People who liked X also liked Y"
**Marble approach:** "Based on your tracked interests, current context, and reaction history, this content receives score X because..."

---

## Core Concept: The Knowledge Graph

At the heart of Marble is a **user-centric knowledge graph** where you are the center node, and everything is scored by its distance to what matters to you.

```
                    [Your Active Projects]
                           |
                   [Your Calendar Today]
                           |
    [AI/Startup] ←------[YOU]------→ [Product Management]
         ↓                                    ↓
   [OpenAI News]                       [SaaS Metrics]
```

Unlike traditional recommendation systems that compare you to other users, Marble builds a unique model of **just you** that evolves over time.

---

## The 5-Dimension Scoring System

Every story gets scored across five dimensions:

### 1. Interest Match (25% weight)
*"Does this topic align with your established interests?"*

- Uses **semantic embeddings** for smart matching
- "EU digital markets act" matches "Shopify compliance" conceptually
- Weights decay over time (14-day half-life) unless reinforced

**Example:**
```
Story: "OpenAI releases GPT-5"
Your interests: ["AI" → 0.8, "Startups" → 0.6]
Interest score: 0.8 (high match on "AI")
```

### 2. Temporal Relevance (30% weight)
*"How relevant is this to current user context?"*

This dimension receives highest weight because current context drives immediate relevance and decision-making.

- Matches against **today's calendar events**
- Considers **active projects** you're working on
- Factors in **recent conversations** you've had

**Example:**
```
Story: "Shopify API security updates"
Your context: {
  active_projects: ["shopify app integration"],
  calendar: ["API review meeting at 2pm"],
  conversations: ["discussed API security yesterday"]
}
Temporal score: 0.9 (extremely relevant today)
```

### 3. Novelty (20% weight)
*"Is this fresh and surprising?"*

- Zero score if you've already seen it
- Lower score for over-saturated topics in your recent history
- Higher score for genuinely new information

### 4. Actionability (15% weight)
*"Can you DO something with this information today?"*

- Detects action words: "launch", "deadline", "opportunity", "available"
- Higher score for practical, implementable insights
- Lower score for purely informational content

### 5. Source Trust (10% weight)
*"How much do you trust this source?"*

- Builds trust scores based on your reaction history
- Sources you consistently upvote get higher trust
- Sources you downvote get penalized

---

## The Learning Loop

Marble gets smarter through a continuous feedback loop:

```
1. Present ranked stories
2. You react (up/down/share/skip)
3. Update interest weights
4. Adjust source trust
5. Learn patterns
6. Improve future rankings
```

### Interest Evolution
- **Positive reaction** → Boost interest weight (+0.1 for upvote, +0.15 for share)
- **Negative reaction** → Decay interest weight (-0.05)
- **Time decay** → All interests naturally fade (14-day half-life)
- **Trend tracking** → "Rising", "stable", or "falling" interest patterns

### Source Trust Evolution
- **Consistent quality** → Increase source trust (+0.02)
- **Poor content** → Decrease source trust (-0.03)
- **New sources** → Start at neutral (0.5)

---

## Digital Twin: The Clone System

The **Clone** creates a digital twin of you for advanced features:

### Snapshot Process
1. **Capture current state** — Active interests, reaction patterns, context
2. **Extract behavior patterns** — What you typically like/dislike
3. **Create immutable snapshot** — Frozen-in-time version of your preferences

### Use Cases
- **Batch processing** — Pre-filter thousands of stories without bothering you
- **A/B testing** — Test different ranking algorithms
- **Quality control** — Predict which stories you'd find valuable

**Example Clone Decision:**
```
Story: "New JavaScript framework announced"
Clone analysis: {
  interest_match: 0.7 (you like programming),
  temporal_context: 0.2 (no active JS projects),
  recent_saturation: 0.3 (saw 3 JS stories this week),
  predicted_reaction: "skip",
  confidence: 0.78
}
```

---

## Narrative Arc Intelligence

Beyond just ranking, Marble arranges stories in a **narrative arc** for optimal engagement:

```
Morning Briefing Arc:
1. OPENER    → "Breaking: Major AI breakthrough"
2. BRIDGE    → "This connects to your startup work because..."
3. DEEP_1    → "Technical deep-dive on the implications"
4. DEEP_2    → "Market analysis and competitive impact"
5. PIVOT     → "Meanwhile, in completely different news..."
6. PRACTICAL → "3 things you can implement this week"
7. HORIZON   → "What this means for 2025"
8. PERSONAL  → "Local startup scene update"
9. CLOSER    → "Inspiring founder story"
```

This isn't random — it's designed like a **well-crafted newsletter** that takes you on a journey.

---

## Scoring Formula

Current implementation of the composite scoring calculation:

```javascript
raw_score = (
  interest_match * 0.25 +
  temporal_relevance * 0.30 +  // Highest experimental weight
  novelty * 0.20 +
  actionability * 0.15 +
  source_trust * 0.10
)

composite_score = raw_score * freshness_decay
```

**Freshness decay** ensures recent stories get priority:
- **< 2 hours:** 100% weight
- **< 6 hours:** 95% weight
- **< 12 hours:** 85% weight
- **< 24 hours:** 70% weight
- **> 48 hours:** 30% weight

---

## Real-World Example

Let's walk through how Marble would score a story for Alex, a startup founder:

**Story:** *"Stripe launches embedded finance APIs"*

**Alex's Context:**
```javascript
{
  interests: [
    { topic: "fintech", weight: 0.7 },
    { topic: "saas", weight: 0.8 },
    { topic: "apis", weight: 0.4 }
  ],
  context: {
    active_projects: ["payment integration", "saas platform"],
    calendar: ["fintech meetup tonight"],
    recent_conversations: ["stripe vs square comparison"]
  },
  source_trust: { "techcrunch": 0.8 }
}
```

**Scoring Breakdown:**
1. **Interest Match:** 0.85 (high match on "fintech" + "saas" + "apis")
2. **Temporal Relevance:** 0.95 (matches active projects + calendar + conversations)
3. **Novelty:** 0.8 (new Stripe announcement, not oversaturated)
4. **Actionability:** 0.7 (APIs are implementable)
5. **Source Trust:** 0.8 (TechCrunch is trusted)

**Final Score:**
```
raw = (0.85×0.25) + (0.95×0.30) + (0.8×0.20) + (0.7×0.15) + (0.8×0.10)
raw = 0.2125 + 0.285 + 0.16 + 0.105 + 0.08 = 0.8425

magic_score = 0.8425 × 1.0 (published 1 hour ago) = 0.84
```

**Result:** Top story with explanation *"relevant to your day, matches your interests, actionable"*

---

## Why This Works Better

### Traditional Collaborative Filtering
❌ Compares you to other users
❌ Ignores your daily context
❌ Static preferences
❌ Cold start problem

### Marble's Approach
✅ Builds unique model of just you
✅ Integrates real-time context
✅ Evolving preferences with decay
✅ Works from day one

### The Temporal Advantage

Most systems ask: *"What does Alex generally like?"*
Marble asks: *"What matters to Alex RIGHT NOW?"*

This is why a story about "Shopify API changes" scores differently when:
- **Monday:** You have no Shopify projects (low relevance)
- **Thursday:** You're building a Shopify app (extremely high relevance)

---

## Advanced Features

### Semantic Understanding
Uses embeddings to understand that:
- "Venture funding" relates to "startup investment"
- "Privacy regulations" connects to "GDPR compliance"
- "Machine learning" links to "AI development"

### Multi-Agent Processing (Swarm)
Multiple specialized agents work together:
- **Quality Agent** — Filters low-quality content
- **Diversity Agent** — Ensures topic variety
- **Timing Agent** — Optimizes for your reading patterns
- **Serendipity Agent** — Occasionally surfaces surprising content

### Evolution System
Continuously optimizes itself:
- **Weight adjustment** — Fine-tune scoring dimensions based on your reactions
- **Parameter optimization** — Find optimal decay rates, novelty thresholds
- **Pattern recognition** — Learn your unique behavior patterns

---

## The Result

Instead of scrolling through hundreds of stories hoping to find something relevant, you get a **curated briefing** of 10-20 stories that are:

1. **Personally relevant** to your interests
2. **Temporally relevant** to your day
3. **Actionable** for your projects
4. **Fresh** and non-repetitive
5. **From trusted** sources
6. **Arranged** in an engaging narrative flow

**Goal:** Automated content filtering based on individual context and preferences.

---

## Getting Started

The beauty of Marble is that it works immediately but gets better over time:

**Day 1:** Basic topic matching, learns from your first reactions
**Week 1:** Understands your interest patterns and source preferences
**Month 1:** Optimizes for your daily rhythm and project cycles
**Quarter 1:** Predicts what you'll find valuable before you see it

Start with a simple setup, feed it your context, and watch it learn what matters to you.

---

**Current goal:** Experimental content scoring system for individual preference modeling and context-aware filtering.