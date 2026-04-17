# Onboarding Persona Steps — Design Spec
*2026-04-17 · Status: approved*

## Goal

Extend the existing 9-step onboarding wizard with 5 additional steps drawn from the Persona Graph Engine spec. The result is a 13-step wizard that captures professional identity, financial mindset, values fingerprint, passion signals, and an upgraded JTBD intent capture — enabling richer KG seeding and day-1 personalization without requiring any external licensed APIs.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Step ordering | Additive (new steps appended after existing 9) | Safest — no disruption to tested flow |
| freeform vs Q2 | Merge — update freeform prompt to JTBD framing, reduce limit to 120 chars, apply NLP | Avoids duplication; freeform field name preserved for backward compat |
| Age collection | Optional bracket chips on the `maritalStatus` screen | No new step needed; non-intrusive |
| Q4 widget | New `pairs` step kind | Cleanest semantics; 3 binary pairs on one screen |
| Integrations | Free tier only: Wikidata SPARQL + Claude API NLP (Haiku) | Mosaic, FAISS, Crunchbase, Google Trends deferred |

---

## Wizard Steps (13 total)

### Unchanged (steps 1–8)
`maritalStatus`* · `kids` · `movieGenres` · `foodPreferences` · `allergies` · `location` · `favoriteShops` · `travel`

*`maritalStatus` gains an optional age bracket row (see below).

### Updated (step 9)
**`freeform`** — prompt updated to JTBD framing, maxLength 280 → 120, `nlp: true` flag added.
- Title: *"What's the #1 thing you want to improve right now?"*
- Subtitle: *"Optional — tell us what you're trying to solve. (120 chars)"*

### New (steps 10–13)

| Step id | Kind | Title | Options |
|---------|------|-------|---------|
| `professional` | `toggle` | "What best describes your main role?" | `founder`, `executive`, `investor`, `professional`, `other` |
| `financialMindset` | `toggle` | "Which feels most relevant to you right now?" | `grow_income`, `protect_assets`, `manage_costs`, `build_something` |
| `valuesFingerprint` | `pairs` | "Choose one from each pair — no right answers" | 3 pairs: Speed/Depth · Stability/Opportunity · Local/Global |
| `passions` | `chips` | "Outside of work, what do you care most about?" | 8 tiles, max 2: Health & Fitness · Family · Travel · Investing · Sports · Technology · Food & Lifestyle · Arts & Culture |

### Age bracket (added to `maritalStatus` screen)
Optional chip row rendered below the relationship-status toggle.
- Field: `ageBracket?: '20s' | '30s' | '40s' | '50s' | '60s+'`
- max: 1, optional: true

---

## New `pairs` Step Kind

A new wizard step kind for binary trade-off pairs. Schema:

```js
{
  id: 'valuesFingerprint',
  kind: 'pairs',
  title: '...',
  pairs: [
    { id: 'speedVsDepth',          labelA: 'Speed',     labelB: 'Depth'       },
    { id: 'stabilityVsOpportunity', labelA: 'Stability', labelB: 'Opportunity' },
    { id: 'localVsGlobal',          labelA: 'Local',     labelB: 'Global'      },
  ]
}
```

Answer shape: `{ speedVsDepth: 'speed'|'depth', stabilityVsOpportunity: 'stability'|'opportunity', localVsGlobal: 'local'|'global' }`

Validation: all 3 keys required, each must be one of its two valid values.

Renderer: 3 rows, each with two mutually exclusive buttons. One selection required per row before step can advance.

---

## Schema Changes (`schema.js`)

### New fields on `OnboardingAnswers`

```js
ageBracket?:       '20s' | '30s' | '40s' | '50s' | '60s+'
professional:      'founder' | 'executive' | 'investor' | 'professional' | 'other'
financialMindset:  'grow_income' | 'protect_assets' | 'manage_costs' | 'build_something'
valuesFingerprint: {
  speedVsDepth:            'speed' | 'depth'
  stabilityVsOpportunity:  'stability' | 'opportunity'
  localVsGlobal:           'local' | 'global'
}
passions: string[]   // 1–2 items, values from PASSION_OPTIONS
```

### New constant arrays exported from `schema.js`

```js
AGE_BRACKET_OPTIONS      = ['20s','30s','40s','50s','60s+']
PROFESSIONAL_OPTIONS     = ['founder','executive','investor','professional','other']
FINANCIAL_MINDSET_OPTIONS= ['grow_income','protect_assets','manage_costs','build_something']
PASSION_OPTIONS          = ['health-fitness','family','travel','investing',
                             'sports','technology','food-lifestyle','arts-culture']
```

### Validation rules
- `ageBracket`: optional; if present, must be in `AGE_BRACKET_OPTIONS`
- `professional`: optional in the validator (required by the wizard UI); if present, must be in `PROFESSIONAL_OPTIONS`
- `financialMindset`: optional in the validator (required by the wizard UI); if present, must be in `FINANCIAL_MINDSET_OPTIONS`
- `valuesFingerprint`: optional in the validator (required by the wizard UI); if present, must be a valid object with all 3 keys, each with a valid value
- `passions`: optional in the validator (required by the wizard UI); if present, non-empty array, max 2 items, all values in `PASSION_OPTIONS`
- `freeform` maxLength: reduced from 280 to 120

> **Backward compat note:** All 4 new fields are validated only when present. Existing test fixtures that omit them continue to pass `validateOnboardingAnswers`. The wizard enforces completion client-side before submission.

---

## KG Mappings (`to-kg.js`)

### `ageBracket` (optional)
```js
identity: { role: 'age_bracket', context: bracket, salience: 0.8 }
```

### `professional`
```js
identity: { role: 'professional_role', context: role, salience: 0.9 }
// removes gap:profession from gaps array
```

### `freeform` (when non-empty)
```js
belief: { topic: 'jtbd:current', claim: text, strength: 0.75 }
// NLP output (async) appends:
//   belief: { topic: 'jtbd:category', claim: jtbd_category, strength: 0.8 }
//   belief: { topic: 'jtbd:urgency',  claim: String(urgency_score), strength: 0.7 }
//   interest per topic_cluster: { topic: 'cluster:<slug>', amount: 0.6 }
```

### `financialMindset`
```js
identity: { role: 'wealth_mindset', context: mindset, salience: 0.75 }
// partially fills gap:income_bracket — remove that gap entry
```

### `valuesFingerprint`
```js
// 3 belief nodes
belief: { topic: 'value:speed_vs_depth',           claim: speedVsDepth,            strength: 0.7 }
belief: { topic: 'value:stability_vs_opportunity',  claim: stabilityVsOpportunity,  strength: 0.7 }
belief: { topic: 'value:local_vs_global',           claim: localVsGlobal,           strength: 0.7 }

// 2 derived OCEAN preference proxies
preference: { type: 'ocean_conscientiousness', description: speedVsDepth,            strength: 0.5 }
preference: { type: 'ocean_openness',          description: stabilityVsOpportunity,  strength: 0.5 }
```

### `passions`
```js
// per passion:
interest:   { topic: 'passion:<slug>', amount: 0.8 }
preference: { type: 'passion_category', description: passion, strength: 0.8 }
// Wikidata enrichment (async, fire-and-forget) appends:
//   interest per sub-topic QID: { topic: 'wikidata:<qid>', amount: 0.5 }
```

### Gap cleanup
| Field answered | Gap removed |
|----------------|------------|
| `professional` | `gap:profession` |
| `financialMindset` | `gap:income_bracket` |

---

## New Files

### `core/onboarding/nlp-pipeline.js`

Classifies the freeform/Q2 JTBD text using the Claude API.

- **Model:** `claude-haiku-4-5-20251001` (fast, cheap, sufficient for classification)
- **Trigger:** Called from `apply-to-kg.js` when `answers.freeform` is non-empty. Fire-and-forget — does not block the onboarding response.
- **Input:** `{ text, context: { role, ageBracket } }`
- **Output:** `{ jtbd_category, topic_clusters: string[], urgency_score: number, time_horizon: string }`
- **Error handling:** Any failure is swallowed. The raw `jtbd:current` belief was already written synchronously; NLP enrichment is best-effort.
- **Guard:** If `ANTHROPIC_API_KEY` is absent, skip entirely.

### `core/onboarding/wikidata.js`

Links passion selections to Wikidata topic entities.

**Layer 1 — static QID map** (no network, always runs):
```js
const PASSION_QIDS = {
  'health-fitness': ['Q11019', 'Q8461'],   // sport, health
  'travel':         ['Q61509'],             // travel
  'investing':      ['Q172357'],            // investment
  'technology':     ['Q11661'],             // information technology
  'food-lifestyle': ['Q2095'],              // food
  'arts-culture':   ['Q735'],               // art
  'family':         ['Q8054'],              // family
  'sports':         ['Q349'],               // sport
}
```

**Layer 2 — SPARQL sub-topic enrichment** (optional, async, fire-and-forget):
- Endpoint: `https://query.wikidata.org/sparql`
- Fetches up to 15 sub-topic QIDs per passion via `wdt:P279*` (subclass-of chain)
- 5-second timeout; any failure is silently skipped
- Results written as `wikidata:<qid>` interest nodes at weight 0.5

---

## Modified Files

### `core/onboarding/apply-to-kg.js`
- After `applyOnboardingToKg` writes the seed: fire `nlp-pipeline.js` (if freeform present + API key set) and `wikidata.js` (if passions present) as independent async calls. Neither is awaited in the main path.

### `core/onboarding/steps.js`
- Add `ageBracket` optional chip row config to `maritalStatus` step
- Update `freeform` step: new title, subtitle, `maxLength: 120`, `nlp: true`
- Append 4 new step definitions: `professional`, `financialMindset`, `valuesFingerprint`, `passions`

### `core/onboarding/schema.js`
- Export 4 new constant arrays
- Add 5 new field validations to `validateOnboardingAnswers`

### `core/onboarding/to-kg.js`
- Add mapping blocks for all 5 new fields
- Remove `gap:profession` and `gap:income_bracket` from gaps when their fields are present

---

## Out of Scope (deferred)

- Experian Mosaic / Nielsen PRIZM (licensed)
- FAISS lookalike engine (needs Python + user base)
- Crunchbase API (conditional on role type)
- Google Trends via pytrends (Python dependency)
- Refinitiv PermID entity resolution
- Neo4j graph database (current KG is JSON-file based)
- `GET /persona/:user_id/explain` transparency endpoint
- GDPR consent node schema

---

## Success Criteria

- All 13 wizard steps render and submit without error
- `validateOnboardingAnswers` rejects missing required new fields
- `answersToKgSeed` produces correct nodes for all new fields
- NLP pipeline fires async when freeform is present and API key is set; failure does not break onboarding
- Wikidata static QID map always writes interest nodes; SPARQL enrichment is best-effort
- Existing tests continue to pass (new fields are additive; backward compat preserved via optional `ageBracket` and unchanged `freeform` field name)
