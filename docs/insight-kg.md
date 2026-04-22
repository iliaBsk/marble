# The Insight-Driven Knowledge Graph

## Overview

Marble's KG (v2) doesn't just track "user likes AI with weight 0.9." It generates hypotheses about **why** a user cares, then tests those hypotheses with content.

Traditional approach:
```
User clicks AI article → interest["AI"] += 0.1
```

Marble's approach:
```
User clicks AI article →
  Hypothesis: "evaluating AI tools for team" (confidence: 0.4)
  Hypothesis: "interested in AI productivity" (confidence: 0.6)
  Cross-reference: 3 recent hiring articles clicked
  Updated: "scaling engineering team, needs AI tooling" (confidence: 0.7)
```

## How It Works

### Signal Ingestion

Every behavioral signal feeds the KG through `ingestSignal()`:

```javascript
await kg.ingestSignal({
  type: 'engagement',
  topic: 'AI code review',
  value: 0.8,
  context: { source: 'hackernews', time: 'morning' },
  timestamp: Date.now()
});
```

Instead of just incrementing a counter, this triggers:

1. **Hypothesis generation** — What might explain this behavior?
2. **Cross-referencing** — How does this relate to other recent signals?
3. **Confidence update** — Bayesian update on existing hypotheses
4. **Prediction generation** — What should we test next?

### Insight Structure

Each insight in the KG contains:

```javascript
{
  id: 'insight-abc123',
  observation: 'User reads AI articles every morning before 10am',
  hypothesis: 'User is evaluating AI tools for upcoming team decision',
  supporting_signals: ['signal-1', 'signal-2', 'signal-3'],
  contradicting_signals: [],
  confidence: 0.72,
  derived_predictions: [
    'Would engage with AI hiring content',
    'Would skip consumer AI entertainment content'
  ],
  source_layer: 'observed',    // 'observed' or 'synthetic'
  created_at: '2026-03-20T09:00:00Z',
  updated_at: '2026-03-24T08:30:00Z',
  test_results: [
    { prediction: 'would_click_ai_hiring', outcome: true, date: '2026-03-22' }
  ]
}
```

### Cross-Referencing

When a new signal arrives, `crossReferenceSignals()` looks for time-proximate clusters:

```
Signal cluster detected (within 2h window):
  - Clicked "AI code review tools" (9:02am)
  - Clicked "Scaling engineering teams" (9:15am)
  - Dwelled 60s on "Remote developer hiring" (9:31am)

Latent pattern: "builder_identity" + "career_transition"
  → New hypothesis: "User actively building/scaling a dev team"
  → Confidence: 0.65
```

### Latent Pattern Library

The insight engine recognizes these behavioral patterns:

| Pattern | Trigger Signals | Meaning |
|---------|----------------|---------|
| vulnerability_armor | gym + security + insurance | Protecting against perceived threats |
| identity_shift_protector | kids + routine + parenting | Adjusting identity around family |
| career_transition | startup + resume + interview | Actively changing career path |
| creative_awakening | art + music + design | Exploring creative expression |
| health_optimization | gym + diet + sleep | Health-focused phase |
| builder_identity | coding + startup + shipping | Building/creating mode |
| stress_coping | meditation + gym + gaming | Managing stress actively |

### Temporal Patterns

The engine detects time-based patterns:

- **Morning signals** (before 10am) → aspirational content, planning
- **Evening signals** (after 7pm) → reflective content, personal growth
- **Weekend signals** → leisure, relationships, side projects
- **Consistent patterns** → core interests vs. passing curiosity

## Hypothesis Testing

The `HypothesisTester` actively validates KG hypotheses:

1. **Select testable hypotheses** — Pick insights with confidence between 0.4-0.8 (uncertain enough to be worth testing)
2. **Generate test content** — Inject specific stories that would confirm or deny the hypothesis
3. **Observe reaction** — Did the user engage?
4. **Bayesian update** — Adjust confidence

```javascript
// Example test
Test: "User avoids consumer AI content" (confidence: 0.55)
  Challenge: Serve a viral consumer AI story
  If engaged → confidence drops to 0.35 (hypothesis weakened)
  If ignored → confidence rises to 0.72 (hypothesis confirmed)
```

### Challenge Templates

| Template | Tests | Challenge Content |
|----------|-------|-------------------|
| stability_vs_spontaneity | "Avoids uncertainty" | Spontaneous travel content |
| protector_vs_adventurer | "Family-focused" | Solo adventure content |
| introvert_vs_social | "Avoids social" | Networking/event content |
| builder_vs_consumer | "Builder identity" | Passive income content |
| frugal_vs_luxury | "Frugal mindset" | Luxury goods content |

### Confidence Propagation

When a hypothesis is confirmed/denied, confidence cascades to related insights:

```
Hypothesis A confirmed (0.55 → 0.72)
  → Related hypothesis B shares 2 supporting signals
  → B's confidence also nudged upward (0.5 → 0.55, damped)
  → Contradicting hypothesis C nudged downward
```

## v1 → v2 Migration

The KG auto-migrates from v1 (flat interests) to v2 (insights) on load:

```javascript
// v1 format
{ interests: [{ topic: "AI", weight: 0.9 }] }

// Auto-migrated to v2
{
  _kg_version: 2,
  user: {
    interests: [{ topic: "AI", weight: 0.9 }],  // kept for compat
    insights: [{
      observation: "User has strong interest in AI",
      hypothesis: "AI is a core professional focus",
      confidence: 0.9,
      source_layer: 'observed'
    }],
    signals: []
  }
}
```

The `getInterests()` method still works for v1-style access.

## Trait Synthesis Layer (L2)

Beyond insights and hypotheses, Marble's L2 **trait synthesis** layer derives structured psychological/behavioral traits from the KG and persists them as `kg.user.syntheses[]`. This is a separate layer from insights — it runs via `marble.synthesize()` (LLM-heavy) and `marble.rebuild()` (deterministic, cheap).

### Synthesis structure

```javascript
{
  id: 'synth_1729..._abc',
  label: 'Replicated across 3 domains — time orientation: compound',  // HUMAN handle
  origin: 'trait_replication',

  // The matchable unit — downstream reasons over these, not the label
  trait: { dimension: 'time_orientation', value: 'compound', weight: 0.85 },

  // Why this pattern coheres — shown to users as the "why"
  mechanics: 'Marathon training, daily prayer, 5-yr company horizons, and long stock holds all imply comfort with delayed feedback.',

  // Provenance — both sides
  reinforcing_nodes:   ['belief:running', 'identity:daily_prayer', 'context:5yr_ventures', 'preference:long_holds'],
  contradicting_nodes: [],
  domains_bridged:     ['health', 'spirituality', 'work', 'finance'],

  // Confidence decomposition — requeryable at different thresholds
  confidence: 0.88,
  confidence_components: {
    base_from_llm: 0.65, replication_bonus: 0.25, contradiction_penalty: 0.0, cross_domain: true
  },

  // Actionable predicates — specific enough to match real content
  affinities:  ['long-form essays on compound practice', 'marathon psychology × stoicism crossovers'],
  aversions:   ['hustle porn', 'viral-in-90-days narratives'],
  predictions: ['Will dwell >2× average on content framing work as endurance sport'],  // falsifiable

  surprising: false,
  generated_at: '2026-04-22T...',
  mode: 'trait_synthesis'
}
```

### Five origin types

| Origin | Source | Confidence signal |
|---|---|---|
| `single_node` | Trait implied by exactly ONE node (Phase 1 only) | Low — `isolated: true`; one data point |
| `trait_replication` | Same trait implied by MULTIPLE nodes, optionally cross-domain | High — `replication_bonus` × `cross_domain` multiplier |
| `contradiction` | Same dimension, DIVERGENT values from disjoint node sets | `contradiction_penalty` applied; `surprising: true` — aspirational-vs-actual gap |
| `emergent_fusion` | Gestalt pattern from K-way cross-domain sample | LLM-stated confidence; patterns no single-node extraction would surface |
| `churn_pattern` | Slot reassigned ≥3 times in 180d (deterministic, no LLM) | Scales with invalidation count; emitted by `rebuild()` not `synthesize()` |

### How it relates to insights

`kg.user.insights[]` and `kg.user.syntheses[]` are separate slots:

- **`insights`** — L1.5 InsightSwarm output. Each insight is a probing question against one psychological lens (fears, desires, etc.). Persistent since PR #48; consumed as L2 seeds.
- **`syntheses`** — L2 trait synthesis output. Each synthesis is a structured trait with evidence, contradiction awareness, and matchable predicates. Consumed by downstream tools (recommenders, briefers) as the WHY behind every ranking.

Insights are *questions worth asking the user*. Syntheses are *traits derivable from what the user has already done*.

## Churn Patterns & Salience

Not every trait lives in the current snapshot of the KG. The fact that a user has **reassigned** a slot many times is itself a trait — "serial pivoter" is a real psychological signal that cannot be seen by examining only the active beliefs.

`marble.rebuild()` runs a churn scan (deterministic, no LLM) that counts invalidations per slot in a trailing window and emits `origin: "churn_pattern"` syntheses when the count crosses a threshold:

```javascript
{
  origin: 'churn_pattern',
  label: 'Churn on belief "current_project"',
  trait: { dimension: 'stability_belief', value: 'serial_pivoter', weight: 1.0 },
  mechanics: 'The belief slot "current_project" has been reassigned 4 times in the past 180 days. This pattern itself is a trait: the user cycles through states on this slot rather than settling. Downstream tools should weight the CURRENT value of this slot less and treat the churn as the stable signal.',
  reinforcing_nodes: [/* all historical records on the slot */],
  predictions: ['The current value on slot "current_project" will be reassigned again within 180d.'],
  surprising: true,
  mode: 'churn_scan'
}
```

### Salience as the filter primitive

Before any pairwise/quadratic pass, use `kg.getTopSalient({ types, limit })` — **never read the raw `getMemoryNodesSummary()` into a quadratic loop** on a real-sized KG.

```
salience = 0.6 × effective_strength + 0.2 × evidence_norm + 0.2 × slot_volatility
```

The stale-active guardrail halves `effective_strength` for `valid_to=null` facts that are old AND low-evidence — prevents old one-off beliefs from dominating top-salient a year after the user moved on.

Use `kg.salienceDistribution()` to triage — if `staleActive / total` is high, the KG has accumulated ingestion noise and downstream reasoning will fight through it.

## Why This Matters

A flat interest tracker tells you: "User likes AI (0.9)."

The insight-driven KG tells you: "User is evaluating AI tools for their growing team, reads technical content in the morning, avoids consumer AI hype, and is likely making a purchasing decision within 2 weeks."

This deeper understanding means:
- **Better scoring** — Content ranked by hypothesis fit, not just topic match
- **Proactive discovery** — Surface content the user didn't know they needed
- **Self-correcting** — Wrong hypotheses are tested and eliminated
- **Explainable** — Every recommendation has a "why" rooted in tested hypotheses
