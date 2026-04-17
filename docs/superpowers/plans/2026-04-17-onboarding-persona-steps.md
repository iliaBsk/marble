# Onboarding Persona Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Marble onboarding wizard from 9 to 13 steps by adding professional identity, financial mindset, values fingerprint, passion signals, and JTBD intent capture — with Wikidata QID linking and Claude API NLP enrichment.

**Architecture:** All new fields are optional in schema validation (enforced by wizard UI) so existing test fixtures continue to pass. Wikidata and NLP enrichment are fire-and-forget async calls wired in `apply-to-kg.js` after the synchronous KG seed is written. `to-kg.js` remains a pure function.

**Tech Stack:** Node.js 18 ESM, `@anthropic-ai/sdk` (already installed), native `fetch` (Node 18+), `node:test` + `node:assert/strict`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `core/onboarding/schema.js` | 4 new constant arrays, 5 new field validations, freeform 280→120 |
| Modify | `core/onboarding/steps.js` | Age bracket on maritalStatus, freeform prompt update, 4 new steps |
| Modify | `core/onboarding/to-kg.js` | KG mappings for all 5 new fields, gap cleanup |
| Create | `core/onboarding/wikidata.js` | Static passion→QID map + async SPARQL sub-topic enrichment |
| Create | `core/onboarding/nlp-pipeline.js` | Claude Haiku JTBD classification for freeform text |
| Modify | `core/onboarding/apply-to-kg.js` | Fire-and-forget NLP + Wikidata after seed apply |
| Modify | `test/onboarding.deterministic.test.js` | Tests for Tasks 1–4, 6 |
| Create | `test/onboarding.nlp.test.js` | Tests for Task 5 (uses injected mock client) |

---

## Task 1: schema.js — new constants and validation

**Files:**
- Modify: `core/onboarding/schema.js`
- Modify: `test/onboarding.deterministic.test.js`

- [ ] **Step 1: Write failing tests for new constants and validation rules**

Add this `describe` block to `test/onboarding.deterministic.test.js` after the existing imports (add `PROFESSIONAL_OPTIONS`, `FINANCIAL_MINDSET_OPTIONS`, `PASSION_OPTIONS`, `AGE_BRACKET_OPTIONS` to the import from `schema.js`):

```js
import {
  validateOnboardingAnswers,
  MARITAL_STATUS_OPTIONS,
  KIDS_OPTIONS,
  PROFESSIONAL_OPTIONS,
  FINANCIAL_MINDSET_OPTIONS,
  PASSION_OPTIONS,
  AGE_BRACKET_OPTIONS,
} from '../core/onboarding/schema.js';
```

Then add a new `describe` block at the bottom of the file:

```js
// ── New persona fields validation ─────────────────────────────

const PERSONA_ANSWERS = {
  ...VALID_ANSWERS,
  professional: 'founder',
  financialMindset: 'grow_income',
  valuesFingerprint: {
    speedVsDepth: 'speed',
    stabilityVsOpportunity: 'opportunity',
    localVsGlobal: 'global',
  },
  passions: ['technology', 'travel'],
};

describe('validateOnboardingAnswers — new persona fields', () => {
  test('accepts answers with all new fields present', () => {
    const result = validateOnboardingAnswers(PERSONA_ANSWERS);
    assert.equal(result.ok, true);
  });

  test('accepts answers where new fields are absent (backward compat)', () => {
    const result = validateOnboardingAnswers(VALID_ANSWERS);
    assert.equal(result.ok, true);
  });

  test('rejects invalid professional value', () => {
    const result = validateOnboardingAnswers({ ...PERSONA_ANSWERS, professional: 'wizard' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('professional')));
  });

  test('rejects invalid financialMindset value', () => {
    const result = validateOnboardingAnswers({ ...PERSONA_ANSWERS, financialMindset: 'hoard_gold' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('financialMindset')));
  });

  test('rejects valuesFingerprint missing a key', () => {
    const result = validateOnboardingAnswers({
      ...PERSONA_ANSWERS,
      valuesFingerprint: { speedVsDepth: 'speed', stabilityVsOpportunity: 'stability' },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('valuesFingerprint')));
  });

  test('rejects valuesFingerprint with invalid value', () => {
    const result = validateOnboardingAnswers({
      ...PERSONA_ANSWERS,
      valuesFingerprint: { speedVsDepth: 'turbo', stabilityVsOpportunity: 'stability', localVsGlobal: 'local' },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('valuesFingerprint')));
  });

  test('rejects passions with more than 2 items', () => {
    const result = validateOnboardingAnswers({
      ...PERSONA_ANSWERS,
      passions: ['technology', 'travel', 'sports'],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('passions')));
  });

  test('rejects passions with invalid value', () => {
    const result = validateOnboardingAnswers({
      ...PERSONA_ANSWERS,
      passions: ['rugby'],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('passions')));
  });

  test('rejects empty passions array', () => {
    const result = validateOnboardingAnswers({ ...PERSONA_ANSWERS, passions: [] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('passions')));
  });

  test('rejects ageBracket with invalid value', () => {
    const result = validateOnboardingAnswers({ ...PERSONA_ANSWERS, ageBracket: '100s' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('ageBracket')));
  });

  test('accepts valid ageBracket', () => {
    const result = validateOnboardingAnswers({ ...PERSONA_ANSWERS, ageBracket: '40s' });
    assert.equal(result.ok, true);
  });

  test('exports PROFESSIONAL_OPTIONS with 5 entries', () => {
    assert.equal(PROFESSIONAL_OPTIONS.length, 5);
    assert.ok(PROFESSIONAL_OPTIONS.includes('founder'));
    assert.ok(PROFESSIONAL_OPTIONS.includes('other'));
  });

  test('exports PASSION_OPTIONS with 8 entries', () => {
    assert.equal(PASSION_OPTIONS.length, 8);
    assert.ok(PASSION_OPTIONS.includes('technology'));
    assert.ok(PASSION_OPTIONS.includes('arts-culture'));
  });
});
```

Also update the **existing** freeform test (line ~123 in the file):

```js
// Change from:
test('rejects freeform over 280 chars', () => {
  const result = validateOnboardingAnswers({ ...VALID_ANSWERS, freeform: 'x'.repeat(281) });
// Change to:
test('rejects freeform over 120 chars', () => {
  const result = validateOnboardingAnswers({ ...VALID_ANSWERS, freeform: 'x'.repeat(121) });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | tail -30
```

Expected: multiple failures — `PROFESSIONAL_OPTIONS is not exported`, `rejects freeform over 120 chars` passes when it should fail, etc.

- [ ] **Step 3: Implement schema.js changes**

Replace the contents of `core/onboarding/schema.js` with:

```js
/**
 * @typedef {'single'|'partnered'|'married'|'divorced'|'prefer_not_say'} MaritalStatus
 * @typedef {'none'|'planning'|'expecting'|'has_young'|'has_teen'|'has_adult'} KidsStatus
 * @typedef {'founder'|'executive'|'investor'|'professional'|'other'} ProfessionalRole
 * @typedef {'grow_income'|'protect_assets'|'manage_costs'|'build_something'} FinancialMindset
 *
 * @typedef {Object} ValuesFingerprint
 * @property {'speed'|'depth'} speedVsDepth
 * @property {'stability'|'opportunity'} stabilityVsOpportunity
 * @property {'local'|'global'} localVsGlobal
 *
 * @typedef {Object} OnboardingAnswers
 * @property {MaritalStatus} maritalStatus
 * @property {string} [ageBracket]
 * @property {KidsStatus} kids
 * @property {string[]} movieGenres
 * @property {string[]} foodPreferences
 * @property {string[]} allergies
 * @property {{ city: string, country?: string }} location
 * @property {string[]} favoriteShops
 * @property {{ regions: string[], summerTypes: string[], winterTypes: string[] }} travel
 * @property {string} [freeform]
 * @property {ProfessionalRole} [professional]
 * @property {FinancialMindset} [financialMindset]
 * @property {ValuesFingerprint} [valuesFingerprint]
 * @property {string[]} [passions]
 */

export const MARITAL_STATUS_OPTIONS = ['single', 'partnered', 'married', 'divorced', 'prefer_not_say'];
export const KIDS_OPTIONS = ['none', 'planning', 'expecting', 'has_young', 'has_teen', 'has_adult'];
export const MOVIE_GENRE_OPTIONS = [
  'action', 'comedy', 'drama', 'sci-fi', 'thriller', 'horror',
  'romance', 'documentary', 'animation', 'fantasy', 'mystery',
  'biography', 'history', 'music', 'sport', 'western', 'crime', 'family'
];
export const FOOD_PREFERENCE_OPTIONS = [
  'mediterranean', 'vegan', 'vegetarian', 'keto', 'high-protein',
  'comfort', 'street-food', 'fine-dining', 'asian', 'latin',
  'middle-eastern', 'japanese', 'indian', 'mexican', 'italian'
];
export const ALLERGY_OPTIONS = ['none', 'gluten', 'dairy', 'nuts', 'shellfish', 'eggs', 'soy', 'fish'];
export const TRAVEL_REGION_OPTIONS = [
  'EU', 'UK', 'North America', 'Latin America', 'Asia',
  'Southeast Asia', 'Middle East', 'Africa', 'Oceania', 'Caribbean'
];
export const TRAVEL_SUMMER_OPTIONS = [
  'beach', 'city-break', 'festival', 'hiking', 'road-trip',
  'island-hopping', 'sailing', 'adventure'
];
export const TRAVEL_WINTER_OPTIONS = [
  'skiing', 'city-break', 'warm-escape', 'christmas-markets',
  'northern-lights', 'staycation', 'wellness-retreat'
];
export const AGE_BRACKET_OPTIONS = ['20s', '30s', '40s', '50s', '60s+'];
export const PROFESSIONAL_OPTIONS = ['founder', 'executive', 'investor', 'professional', 'other'];
export const FINANCIAL_MINDSET_OPTIONS = ['grow_income', 'protect_assets', 'manage_costs', 'build_something'];
export const PASSION_OPTIONS = [
  'health-fitness', 'family', 'travel', 'investing',
  'sports', 'technology', 'food-lifestyle', 'arts-culture'
];

/**
 * @param {unknown} input
 * @returns {{ ok: true, value: OnboardingAnswers } | { ok: false, errors: string[] }}
 */
export function validateOnboardingAnswers(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['answers must be an object'] };
  }

  const a = /** @type {Record<string,unknown>} */ (input);

  if (!MARITAL_STATUS_OPTIONS.includes(/** @type {string} */ (a.maritalStatus))) {
    errors.push(`maritalStatus must be one of: ${MARITAL_STATUS_OPTIONS.join(', ')}`);
  }

  if (a.ageBracket !== undefined && !AGE_BRACKET_OPTIONS.includes(/** @type {string} */ (a.ageBracket))) {
    errors.push(`ageBracket must be one of: ${AGE_BRACKET_OPTIONS.join(', ')}`);
  }

  if (!KIDS_OPTIONS.includes(/** @type {string} */ (a.kids))) {
    errors.push(`kids must be one of: ${KIDS_OPTIONS.join(', ')}`);
  }

  if (!Array.isArray(a.movieGenres) || a.movieGenres.length === 0) {
    errors.push('movieGenres must be a non-empty array');
  } else {
    const invalid = a.movieGenres.filter(v => !MOVIE_GENRE_OPTIONS.includes(v));
    if (invalid.length) errors.push(`invalid movieGenres: ${invalid.join(', ')}`);
  }

  if (!Array.isArray(a.foodPreferences) || a.foodPreferences.length === 0) {
    errors.push('foodPreferences must be a non-empty array');
  } else {
    const invalid = a.foodPreferences.filter(v => !FOOD_PREFERENCE_OPTIONS.includes(v));
    if (invalid.length) errors.push(`invalid foodPreferences: ${invalid.join(', ')}`);
  }

  if (!Array.isArray(a.allergies)) {
    errors.push('allergies must be an array');
  } else {
    const invalid = a.allergies.filter(v => !ALLERGY_OPTIONS.includes(v));
    if (invalid.length) errors.push(`invalid allergies: ${invalid.join(', ')}`);
  }

  if (!a.location || typeof a.location !== 'object') {
    errors.push('location must be an object');
  } else {
    const loc = /** @type {Record<string,unknown>} */ (a.location);
    if (!loc.city || typeof loc.city !== 'string' || loc.city.trim() === '') {
      errors.push('location.city is required');
    } else if (loc.city.length > 100) {
      errors.push('location.city must be 100 characters or fewer');
    }
  }

  if (!Array.isArray(a.favoriteShops)) {
    errors.push('favoriteShops must be an array');
  } else {
    const invalid = a.favoriteShops.filter(
      v => typeof v !== 'string' || v.trim() === '' || v.length > 100
    );
    if (invalid.length) errors.push('favoriteShops must be non-empty strings of ≤100 characters each');
  }

  if (!a.travel || typeof a.travel !== 'object') {
    errors.push('travel must be an object');
  } else {
    const t = /** @type {Record<string,unknown>} */ (a.travel);
    if (!Array.isArray(t.regions)) {
      errors.push('travel.regions must be an array');
    } else {
      const invalid = t.regions.filter(v => !TRAVEL_REGION_OPTIONS.includes(v));
      if (invalid.length) errors.push(`invalid travel.regions: ${invalid.join(', ')}`);
    }
    if (!Array.isArray(t.summerTypes)) {
      errors.push('travel.summerTypes must be an array');
    } else {
      const invalid = t.summerTypes.filter(v => !TRAVEL_SUMMER_OPTIONS.includes(v));
      if (invalid.length) errors.push(`invalid travel.summerTypes: ${invalid.join(', ')}`);
    }
    if (!Array.isArray(t.winterTypes)) {
      errors.push('travel.winterTypes must be an array');
    } else {
      const invalid = t.winterTypes.filter(v => !TRAVEL_WINTER_OPTIONS.includes(v));
      if (invalid.length) errors.push(`invalid travel.winterTypes: ${invalid.join(', ')}`);
    }
  }

  if (a.freeform !== undefined && typeof a.freeform !== 'string') {
    errors.push('freeform must be a string if provided');
  }
  if (typeof a.freeform === 'string' && a.freeform.length > 120) {
    errors.push('freeform must be 120 characters or fewer');
  }

  if (a.professional !== undefined && !PROFESSIONAL_OPTIONS.includes(/** @type {string} */ (a.professional))) {
    errors.push(`professional must be one of: ${PROFESSIONAL_OPTIONS.join(', ')}`);
  }

  if (a.financialMindset !== undefined && !FINANCIAL_MINDSET_OPTIONS.includes(/** @type {string} */ (a.financialMindset))) {
    errors.push(`financialMindset must be one of: ${FINANCIAL_MINDSET_OPTIONS.join(', ')}`);
  }

  if (a.valuesFingerprint !== undefined) {
    if (!a.valuesFingerprint || typeof a.valuesFingerprint !== 'object') {
      errors.push('valuesFingerprint must be an object');
    } else {
      const vf = /** @type {Record<string,unknown>} */ (a.valuesFingerprint);
      if (!['speed', 'depth'].includes(/** @type {string} */ (vf.speedVsDepth))) {
        errors.push('valuesFingerprint.speedVsDepth must be "speed" or "depth"');
      }
      if (!['stability', 'opportunity'].includes(/** @type {string} */ (vf.stabilityVsOpportunity))) {
        errors.push('valuesFingerprint.stabilityVsOpportunity must be "stability" or "opportunity"');
      }
      if (!['local', 'global'].includes(/** @type {string} */ (vf.localVsGlobal))) {
        errors.push('valuesFingerprint.localVsGlobal must be "local" or "global"');
      }
    }
  }

  if (a.passions !== undefined) {
    if (!Array.isArray(a.passions) || a.passions.length === 0) {
      errors.push('passions must be a non-empty array');
    } else if (a.passions.length > 2) {
      errors.push('passions must have at most 2 items');
    } else {
      const invalid = a.passions.filter(v => !PASSION_OPTIONS.includes(v));
      if (invalid.length) errors.push(`invalid passions: ${invalid.join(', ')}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: /** @type {OnboardingAnswers} */ (input) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | tail -30
```

Expected: all tests pass, including the updated `rejects freeform over 120 chars` test.

- [ ] **Step 5: Commit**

```bash
cd /srv/projects/marble && git add core/onboarding/schema.js test/onboarding.deterministic.test.js && git commit -m "feat: add persona field constants and validation to onboarding schema"
```

---

## Task 2: steps.js — age bracket, freeform update, 4 new steps

**Files:**
- Modify: `core/onboarding/steps.js`

- [ ] **Step 1: Write failing test for STEPS array shape**

Add to the `describe('validateOnboardingAnswers — new persona fields', ...)` block or as a new block in `test/onboarding.deterministic.test.js`:

```js
import { STEPS, getStep } from '../core/onboarding/steps.js';
```

Add this import at the top alongside existing imports, then add:

```js
describe('STEPS array — new persona steps', () => {
  test('has 13 steps total', () => {
    assert.equal(STEPS.length, 13);
  });

  test('includes professional step with kind toggle', () => {
    const step = getStep('professional');
    assert.ok(step, 'professional step missing');
    assert.equal(step.kind, 'toggle');
    assert.ok(step.options.some(o => o.value === 'founder'));
    assert.ok(step.options.some(o => o.value === 'other'));
  });

  test('includes financialMindset step with 4 options', () => {
    const step = getStep('financialMindset');
    assert.ok(step, 'financialMindset step missing');
    assert.equal(step.kind, 'toggle');
    assert.equal(step.options.length, 4);
  });

  test('includes valuesFingerprint step with kind pairs and 3 pairs', () => {
    const step = getStep('valuesFingerprint');
    assert.ok(step, 'valuesFingerprint step missing');
    assert.equal(step.kind, 'pairs');
    assert.equal(step.pairs.length, 3);
    assert.ok(step.pairs.some(p => p.id === 'speedVsDepth'));
    assert.ok(step.pairs.some(p => p.id === 'stabilityVsOpportunity'));
    assert.ok(step.pairs.some(p => p.id === 'localVsGlobal'));
  });

  test('includes passions step with 8 options and max 2', () => {
    const step = getStep('passions');
    assert.ok(step, 'passions step missing');
    assert.equal(step.kind, 'chips');
    assert.equal(step.multi, true);
    assert.equal(step.max, 2);
    assert.equal(step.options.length, 8);
  });

  test('maritalStatus step has ageBracket sub-field', () => {
    const step = getStep('maritalStatus');
    assert.ok(step.ageBracket, 'ageBracket sub-field missing');
    assert.equal(step.ageBracket.kind, 'chips');
    assert.equal(step.ageBracket.optional, true);
    assert.equal(step.ageBracket.max, 1);
  });

  test('freeform step has updated prompt and maxLength 120', () => {
    const step = getStep('freeform');
    assert.ok(step.title.includes('improve') || step.title.includes('solve'), 'freeform title not updated');
    assert.equal(step.maxLength, 120);
    assert.equal(step.nlp, true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | grep -E "FAIL|Error" | head -20
```

Expected: all new STEPS tests fail.

- [ ] **Step 3: Implement steps.js changes**

Replace `core/onboarding/steps.js` with:

```js
/**
 * Declarative wizard step definitions.
 * Consumed by both the API (for validation context) and the browser (for rendering).
 *
 * @typedef {'toggle'|'chips'|'city-picker'|'chip-groups'|'freeform'|'pairs'} StepKind
 * @typedef {Object} StepOption
 * @property {string} value
 * @property {string} label
 *
 * @typedef {Object} PairDef
 * @property {string} id
 * @property {string} labelA
 * @property {string} labelB
 *
 * @typedef {Object} WizardStep
 * @property {string} id
 * @property {string} title
 * @property {string} [subtitle]
 * @property {StepKind} kind
 * @property {StepOption[]} [options]
 * @property {boolean} [multi]
 * @property {number} [max]
 * @property {number} [maxLength]
 * @property {boolean} [nlp]
 * @property {string} [dependsOn]
 * @property {Object[]} [groups]
 * @property {PairDef[]} [pairs]
 * @property {{ kind: string, optional: boolean, max: number, options: StepOption[] }} [ageBracket]
 */

import {
  MARITAL_STATUS_OPTIONS,
  KIDS_OPTIONS,
  MOVIE_GENRE_OPTIONS,
  FOOD_PREFERENCE_OPTIONS,
  ALLERGY_OPTIONS,
  TRAVEL_REGION_OPTIONS,
  TRAVEL_SUMMER_OPTIONS,
  TRAVEL_WINTER_OPTIONS,
  AGE_BRACKET_OPTIONS,
  PROFESSIONAL_OPTIONS,
  FINANCIAL_MINDSET_OPTIONS,
  PASSION_OPTIONS,
} from './schema.js';

/** @param {string[]} values @param {(v:string)=>string} [labelFn] @returns {StepOption[]} */
const opts = (values, labelFn) =>
  values.map(v => ({ value: v, label: labelFn ? labelFn(v) : toLabel(v) }));

/** Convert snake/kebab-case to Title Case label */
function toLabel(v) {
  return v.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** @type {WizardStep[]} */
export const STEPS = [
  {
    id: 'maritalStatus',
    title: "What's your relationship status?",
    kind: 'toggle',
    options: opts(MARITAL_STATUS_OPTIONS, v => ({
      single: 'Single',
      partnered: 'In a relationship',
      married: 'Married',
      divorced: 'Divorced / Separated',
      prefer_not_say: 'Prefer not to say',
    }[v])),
    ageBracket: {
      kind: 'chips',
      optional: true,
      max: 1,
      options: opts(AGE_BRACKET_OPTIONS),
    },
  },
  {
    id: 'kids',
    title: 'Any kids in the picture?',
    kind: 'toggle',
    options: opts(KIDS_OPTIONS, v => ({
      none: 'No kids',
      planning: 'Planning to have kids',
      expecting: 'Expecting',
      has_young: 'Young kids (0–10)',
      has_teen: 'Teenagers',
      has_adult: 'Adult children',
    }[v])),
  },
  {
    id: 'movieGenres',
    title: 'What kind of movies do you enjoy?',
    subtitle: 'Pick a few.',
    kind: 'chips',
    multi: true,
    options: opts(MOVIE_GENRE_OPTIONS),
  },
  {
    id: 'foodPreferences',
    title: 'Your food vibe?',
    subtitle: 'Pick everything that applies.',
    kind: 'chips',
    multi: true,
    options: opts(FOOD_PREFERENCE_OPTIONS),
  },
  {
    id: 'allergies',
    title: 'Any dietary restrictions or allergies?',
    kind: 'chips',
    multi: true,
    options: opts(ALLERGY_OPTIONS),
  },
  {
    id: 'location',
    title: 'Where are you based?',
    subtitle: "We'll tailor local recommendations to your city.",
    kind: 'city-picker',
  },
  {
    id: 'favoriteShops',
    title: 'Where do you usually shop?',
    subtitle: 'Showing popular stores near you.',
    kind: 'chips',
    multi: true,
    dependsOn: 'location',
    options: [], // populated dynamically from shops-registry based on location answer
  },
  {
    id: 'travel',
    title: 'How do you like to travel?',
    kind: 'chip-groups',
    groups: [
      {
        id: 'regions',
        label: 'Where do you usually go?',
        multi: true,
        options: opts(TRAVEL_REGION_OPTIONS),
      },
      {
        id: 'summerTypes',
        label: 'Summer holidays?',
        multi: true,
        options: opts(TRAVEL_SUMMER_OPTIONS),
      },
      {
        id: 'winterTypes',
        label: 'Winter getaways?',
        multi: true,
        options: opts(TRAVEL_WINTER_OPTIONS),
      },
    ],
  },
  {
    id: 'freeform',
    title: "What's the #1 thing you want to improve right now?",
    subtitle: 'Optional — tell us what you\'re trying to solve. (120 chars)',
    kind: 'freeform',
    maxLength: 120,
    nlp: true,
  },
  {
    id: 'professional',
    title: 'What best describes your main role?',
    kind: 'toggle',
    options: opts(PROFESSIONAL_OPTIONS, v => ({
      founder: 'Founder / Co-founder',
      executive: 'Executive / Senior Manager',
      investor: 'Investor / Fund Manager',
      professional: 'Professional / Specialist',
      other: 'Other',
    }[v])),
  },
  {
    id: 'financialMindset',
    title: 'Which feels most relevant to you right now?',
    kind: 'toggle',
    options: opts(FINANCIAL_MINDSET_OPTIONS, v => ({
      grow_income: 'Growing my income or business',
      protect_assets: 'Protecting and investing what I have',
      manage_costs: 'Managing costs and getting more value',
      build_something: 'Building something new from scratch',
    }[v])),
  },
  {
    id: 'valuesFingerprint',
    title: 'Choose one from each pair — no right answers',
    kind: 'pairs',
    pairs: [
      { id: 'speedVsDepth',           labelA: 'Speed',     labelB: 'Depth'       },
      { id: 'stabilityVsOpportunity', labelA: 'Stability', labelB: 'Opportunity' },
      { id: 'localVsGlobal',          labelA: 'Local',     labelB: 'Global'      },
    ],
  },
  {
    id: 'passions',
    title: 'Outside of work, what do you care most about?',
    subtitle: 'Pick up to 2.',
    kind: 'chips',
    multi: true,
    max: 2,
    options: opts(PASSION_OPTIONS, v => ({
      'health-fitness': '🏃 Health & Fitness',
      family:           '👨‍👩‍👧 Family',
      travel:           '✈️ Travel',
      investing:        '📈 Investing',
      sports:           '⚽ Sports',
      technology:       '💻 Technology',
      'food-lifestyle': '🍽️ Food & Lifestyle',
      'arts-culture':   '🎨 Arts & Culture',
    }[v])),
  },
];

/** @returns {WizardStep|undefined} */
export function getStep(id) {
  return STEPS.find(s => s.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /srv/projects/marble && git add core/onboarding/steps.js test/onboarding.deterministic.test.js && git commit -m "feat: add persona wizard steps (professional, financialMindset, valuesFingerprint, passions)"
```

---

## Task 3: to-kg.js — KG mappings for new fields

**Files:**
- Modify: `core/onboarding/to-kg.js`
- Modify: `test/onboarding.deterministic.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/onboarding.deterministic.test.js` after the existing `answersToKgSeed` describe block.
Note: `PERSONA_ANSWERS` was defined at module scope in Task 1 — it is available here.

```js
describe('answersToKgSeed — new persona fields', () => {
  const seed = answersToKgSeed(PERSONA_ANSWERS);

  test('produces professional_role identity', () => {
    const id = seed.identities.find(i => i.role === 'professional_role');
    assert.ok(id, 'professional_role identity missing');
    assert.equal(id.context, 'founder');
    assert.ok(id.salience >= 0.9);
  });

  test('removes gap:profession when professional is present', () => {
    assert.ok(!seed.gaps.some(g => g.topic === 'gap:profession'), 'gap:profession should be removed');
  });

  test('still includes gap:profession when professional is absent', () => {
    const seedWithout = answersToKgSeed(VALID_ANSWERS);
    assert.ok(seedWithout.gaps.some(g => g.topic === 'gap:profession'));
  });

  test('produces wealth_mindset identity', () => {
    const id = seed.identities.find(i => i.role === 'wealth_mindset');
    assert.ok(id, 'wealth_mindset identity missing');
    assert.equal(id.context, 'grow_income');
    assert.ok(id.salience >= 0.7);
  });

  test('removes gap:income_bracket when financialMindset is present', () => {
    assert.ok(!seed.gaps.some(g => g.topic === 'gap:income_bracket'), 'gap:income_bracket should be removed');
  });

  test('produces 3 value beliefs from valuesFingerprint', () => {
    const valueBeliefs = seed.beliefs.filter(b => b.topic.startsWith('value:'));
    assert.equal(valueBeliefs.length, 3);
    assert.ok(valueBeliefs.some(b => b.topic === 'value:speed_vs_depth' && b.claim === 'speed'));
    assert.ok(valueBeliefs.some(b => b.topic === 'value:stability_vs_opportunity' && b.claim === 'opportunity'));
    assert.ok(valueBeliefs.some(b => b.topic === 'value:local_vs_global' && b.claim === 'global'));
  });

  test('produces OCEAN preference proxies from valuesFingerprint', () => {
    const oceanPrefs = seed.preferences.filter(p => p.type.startsWith('ocean_'));
    assert.equal(oceanPrefs.length, 2);
    assert.ok(oceanPrefs.some(p => p.type === 'ocean_conscientiousness'));
    assert.ok(oceanPrefs.some(p => p.type === 'ocean_openness'));
  });

  test('produces passion interest entries', () => {
    const passionInterests = seed.interests.filter(i => i.topic.startsWith('passion:'));
    assert.equal(passionInterests.length, 2);
    assert.ok(passionInterests.some(i => i.topic === 'passion:technology'));
    assert.ok(passionInterests.some(i => i.topic === 'passion:travel'));
    for (const pi of passionInterests) assert.ok(pi.amount >= 0.7);
  });

  test('produces passion_category preferences', () => {
    const passionPrefs = seed.preferences.filter(p => p.type === 'passion_category');
    assert.equal(passionPrefs.length, 2);
    assert.ok(passionPrefs.some(p => p.description === 'technology'));
    assert.ok(passionPrefs.some(p => p.description === 'travel'));
  });

  test('produces age_bracket identity when ageBracket present', () => {
    const withAge = answersToKgSeed({ ...PERSONA_ANSWERS, ageBracket: '40s' });
    const id = withAge.identities.find(i => i.role === 'age_bracket');
    assert.ok(id, 'age_bracket identity missing');
    assert.equal(id.context, '40s');
    assert.ok(id.salience >= 0.7);
  });

  test('no age_bracket identity when ageBracket absent', () => {
    const withoutAge = answersToKgSeed(PERSONA_ANSWERS);
    assert.ok(!withoutAge.identities.find(i => i.role === 'age_bracket'));
  });

  test('produces jtbd:current belief when freeform present', () => {
    const withFreeform = answersToKgSeed({ ...PERSONA_ANSWERS, freeform: 'grow my startup' });
    const belief = withFreeform.beliefs.find(b => b.topic === 'jtbd:current');
    assert.ok(belief, 'jtbd:current belief missing');
    assert.equal(belief.claim, 'grow my startup');
    assert.ok(belief.strength >= 0.7);
  });

  test('no jtbd:current belief when freeform absent', () => {
    const { freeform: _, ...noFreeform } = PERSONA_ANSWERS;
    const s = answersToKgSeed(noFreeform);
    assert.ok(!s.beliefs.find(b => b.topic === 'jtbd:current'));
  });

  test('gap count is 4 when professional and financialMindset both present', () => {
    assert.equal(seed.gaps.length, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | grep -E "fail|Error" | head -20
```

Expected: all new persona-field KG tests fail.

- [ ] **Step 3: Implement to-kg.js changes**

Replace `core/onboarding/to-kg.js` with:

```js
/**
 * Pure function: converts validated OnboardingAnswers into a normalized KG seed.
 * No LLM, no network, no side effects.
 *
 * @param {import('./schema.js').OnboardingAnswers} answers
 * @returns {KgSeed}
 */

/**
 * @typedef {Object} KgSeed
 * @property {Array<{topic:string,claim:string,strength:number}>} beliefs
 * @property {Array<{type:string,description:string,strength:number}>} preferences
 * @property {Array<{role:string,context:string,salience:number}>} identities
 * @property {Array<{topic:string,amount:number}>} interests
 * @property {Record<string,number>} confidence
 * @property {Array<{topic:string,claim:string,strength:number}>} gaps
 */

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function answersToKgSeed(answers) {
  /** @type {KgSeed} */
  const seed = { beliefs: [], preferences: [], identities: [], interests: [], confidence: {}, gaps: [] };

  // ── Relationship status ──
  seed.identities.push({
    role: 'relationship_status',
    context: answers.maritalStatus,
    salience: 0.85,
  });

  // ── Age bracket (optional) ──
  if (answers.ageBracket) {
    seed.identities.push({ role: 'age_bracket', context: answers.ageBracket, salience: 0.8 });
  }

  // ── Kids ──
  seed.identities.push({
    role: 'parental_status',
    context: answers.kids,
    salience: 0.9,
  });

  // ── Movie genres ──
  for (const genre of answers.movieGenres) {
    seed.interests.push({ topic: `genre:${slug(genre)}`, amount: 0.6 });
    seed.preferences.push({ type: 'genre_preference', description: genre, strength: 0.7 });
  }
  if (answers.movieGenres.length > 0) {
    seed.confidence['entertainment'] = 0.6;
  }

  // ── Food preferences ──
  for (const food of answers.foodPreferences) {
    seed.interests.push({ topic: `food:${slug(food)}`, amount: 0.5 });
    seed.preferences.push({ type: 'cuisine_preference', description: food, strength: 0.7 });
  }

  // ── Allergies — treated as high-strength medical beliefs ──
  // Each allergy gets its own topic to avoid contradiction detection closing prior entries.
  const realAllergies = answers.allergies.filter(a => a !== 'none');
  for (const allergy of realAllergies) {
    seed.beliefs.push({
      topic: `dietary_restriction:${slug(allergy)}`,
      claim: `avoids ${allergy}`,
      strength: 0.95,
    });
  }
  if (answers.allergies.includes('none')) {
    seed.beliefs.push({ topic: 'dietary_restriction:none', claim: 'no known allergies', strength: 0.9 });
  }

  // ── Location ──
  const city = answers.location.city.trim();
  seed.identities.push({ role: 'location', context: city, salience: 0.9 });
  seed.interests.push({ topic: `city:${slug(city)}`, amount: 0.7 });
  if (answers.location.country) {
    seed.identities.push({ role: 'country', context: answers.location.country, salience: 0.7 });
  }

  // ── Favorite local shops ──
  for (const shop of answers.favoriteShops) {
    seed.preferences.push({ type: 'brand_preference', description: shop, strength: 0.75 });
    seed.interests.push({ topic: `brand:${slug(shop)}`, amount: 0.4 });
  }

  // ── Travel regions ──
  for (const region of answers.travel.regions) {
    seed.preferences.push({ type: 'travel_region_preference', description: region, strength: 0.7 });
    seed.interests.push({ topic: `region:${slug(region)}`, amount: 0.5 });
  }

  // ── Travel seasonal types ──
  for (const type of answers.travel.summerTypes) {
    seed.preferences.push({ type: 'travel_style', description: `summer:${type}`, strength: 0.7 });
  }
  for (const type of answers.travel.winterTypes) {
    seed.preferences.push({ type: 'travel_style', description: `winter:${type}`, strength: 0.7 });
  }

  // ── JTBD intent (freeform text) ──
  if (answers.freeform && answers.freeform.trim()) {
    seed.beliefs.push({ topic: 'jtbd:current', claim: answers.freeform.trim(), strength: 0.75 });
  }

  // ── Professional role ──
  if (answers.professional) {
    seed.identities.push({ role: 'professional_role', context: answers.professional, salience: 0.9 });
  }

  // ── Financial mindset ──
  if (answers.financialMindset) {
    seed.identities.push({ role: 'wealth_mindset', context: answers.financialMindset, salience: 0.75 });
  }

  // ── Values fingerprint ──
  if (answers.valuesFingerprint) {
    const vf = answers.valuesFingerprint;
    seed.beliefs.push({ topic: 'value:speed_vs_depth',           claim: vf.speedVsDepth,            strength: 0.7 });
    seed.beliefs.push({ topic: 'value:stability_vs_opportunity', claim: vf.stabilityVsOpportunity,  strength: 0.7 });
    seed.beliefs.push({ topic: 'value:local_vs_global',          claim: vf.localVsGlobal,            strength: 0.7 });
    seed.preferences.push({ type: 'ocean_conscientiousness', description: vf.speedVsDepth,            strength: 0.5 });
    seed.preferences.push({ type: 'ocean_openness',          description: vf.stabilityVsOpportunity,  strength: 0.5 });
  }

  // ── Passions ──
  if (answers.passions && answers.passions.length > 0) {
    for (const passion of answers.passions) {
      seed.interests.push({ topic: `passion:${slug(passion)}`, amount: 0.8 });
      seed.preferences.push({ type: 'passion_category', description: passion, strength: 0.8 });
    }
  }

  // ── Knowledge gaps for clone seeding ──
  // Gaps are omitted when the corresponding field was answered.
  const filledGaps = new Set();
  if (answers.professional)     filledGaps.add('gap:profession');
  if (answers.financialMindset) filledGaps.add('gap:income_bracket');

  const gapQuestions = [
    { topic: 'gap:profession',    claim: "What is the user's profession or industry?" },
    { topic: 'gap:income_bracket',claim: "What is the user's approximate income bracket?" },
    { topic: 'gap:fitness_habits',claim: "What are the user's fitness and health habits?" },
    { topic: 'gap:media_depth',   claim: 'Does the user prefer deep/niche or broad/mainstream media?' },
    { topic: 'gap:tech_affinity', claim: 'How tech-savvy is the user?' },
    { topic: 'gap:social_values', claim: "What are the user's social and political values?" },
  ];

  for (const gap of gapQuestions) {
    if (!filledGaps.has(gap.topic)) {
      seed.gaps.push({ ...gap, strength: 0.2 });
    }
  }

  return seed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /srv/projects/marble && git add core/onboarding/to-kg.js test/onboarding.deterministic.test.js && git commit -m "feat: add KG mappings for professional, financialMindset, valuesFingerprint, passions, ageBracket"
```

---

## Task 4: wikidata.js — static QID map + SPARQL enrichment

**Files:**
- Create: `core/onboarding/wikidata.js`
- Modify: `test/onboarding.deterministic.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/onboarding.deterministic.test.js`:

```js
import { getTopicInterestsForPassions } from '../core/onboarding/wikidata.js';

describe('wikidata — getTopicInterestsForPassions', () => {
  test('returns interest nodes for known passions', () => {
    const interests = getTopicInterestsForPassions(['technology', 'travel']);
    assert.ok(interests.length >= 2, `expected ≥2 interests, got ${interests.length}`);
    assert.ok(interests.every(i => i.topic.startsWith('wikidata:')));
    assert.ok(interests.every(i => typeof i.amount === 'number' && i.amount > 0));
  });

  test('maps technology to Q11661', () => {
    const interests = getTopicInterestsForPassions(['technology']);
    assert.ok(interests.some(i => i.topic === 'wikidata:Q11661'));
  });

  test('maps travel to Q61509', () => {
    const interests = getTopicInterestsForPassions(['travel']);
    assert.ok(interests.some(i => i.topic === 'wikidata:Q61509'));
  });

  test('returns empty array for unknown passion', () => {
    const interests = getTopicInterestsForPassions(['unknown-passion']);
    assert.deepEqual(interests, []);
  });

  test('returns empty array for empty input', () => {
    assert.deepEqual(getTopicInterestsForPassions([]), []);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | grep -E "fail|Error|wikidata" | head -10
```

Expected: import fails — `wikidata.js` does not exist.

- [ ] **Step 3: Create core/onboarding/wikidata.js**

```js
/**
 * Wikidata integration for passion → topic entity linking.
 *
 * Layer 1 (sync): static passion → QID map, always runs.
 * Layer 2 (async): SPARQL sub-topic enrichment, fire-and-forget, 5s timeout.
 */

const PASSION_QIDS = {
  'health-fitness': ['Q11019', 'Q8461'],
  'travel':         ['Q61509'],
  'investing':      ['Q172357'],
  'technology':     ['Q11661'],
  'food-lifestyle': ['Q2095'],
  'arts-culture':   ['Q735'],
  'family':         ['Q8054'],
  'sports':         ['Q349'],
};

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

/**
 * Returns static interest nodes for the given passions (no network).
 * @param {string[]} passions
 * @returns {Array<{topic:string,amount:number}>}
 */
export function getTopicInterestsForPassions(passions) {
  const interests = [];
  for (const passion of passions) {
    for (const qid of (PASSION_QIDS[passion] || [])) {
      interests.push({ topic: `wikidata:${qid}`, amount: 0.5 });
    }
  }
  return interests;
}

/**
 * Writes static QID interests then fetches SPARQL sub-topics (fire-and-forget in caller).
 * Swallows all errors — enrichment is always best-effort.
 * @param {import('../kg.js').KnowledgeGraph} kg
 * @param {string[]} passions
 */
export async function enrichWithWikidata(kg, passions) {
  for (const interest of getTopicInterestsForPassions(passions)) {
    kg.boostInterest(interest.topic, interest.amount);
  }

  for (const passion of passions) {
    for (const qid of (PASSION_QIDS[passion] || [])) {
      try {
        const sparql = `SELECT ?sub WHERE { ?sub wdt:P279* wd:${qid} } LIMIT 15`;
        const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json', 'User-Agent': 'MarblePersona/1.0' },
        });
        clearTimeout(timer);
        if (!resp.ok) continue;
        const data = await resp.json();
        for (const binding of (data.results?.bindings || [])) {
          const subQid = binding.sub?.value?.split('/').pop();
          if (subQid && /^Q\d+$/.test(subQid)) {
            kg.boostInterest(`wikidata:${subQid}`, 0.5);
          }
        }
      } catch {
        // silently skip on timeout or network error
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /srv/projects/marble && git add core/onboarding/wikidata.js test/onboarding.deterministic.test.js && git commit -m "feat: add wikidata passion-to-QID mapping and SPARQL enrichment"
```

---

## Task 5: nlp-pipeline.js — Claude Haiku JTBD classification

**Files:**
- Create: `core/onboarding/nlp-pipeline.js`
- Create: `test/onboarding.nlp.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/onboarding.nlp.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { classifyJtbd } from '../core/onboarding/nlp-pipeline.js';

// Mock Anthropic client — returns a valid classification JSON
function makeMockClient(responseText) {
  return {
    messages: {
      async create() {
        return { content: [{ text: responseText }] };
      },
    },
  };
}

describe('classifyJtbd', () => {
  test('returns null when no API key and no injected client', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const result = await classifyJtbd('grow my startup', {});
    assert.equal(result, null);
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });

  test('returns classification object with injected client', async () => {
    const mockResponse = JSON.stringify({
      jtbd_category: 'build_something',
      topic_clusters: ['startup', 'product'],
      urgency_score: 8,
      time_horizon: 'immediate',
    });
    const client = makeMockClient(mockResponse);
    const result = await classifyJtbd('I need to launch my MVP fast', { role: 'founder' }, client);

    assert.ok(result, 'result should not be null');
    assert.equal(result.jtbd_category, 'build_something');
    assert.deepEqual(result.topic_clusters, ['startup', 'product']);
    assert.equal(result.urgency_score, 8);
    assert.equal(result.time_horizon, 'immediate');
  });

  test('extracts JSON from response with surrounding text', async () => {
    const mockResponse = 'Here is the analysis:\n```json\n{"jtbd_category":"grow_income","topic_clusters":["revenue"],"urgency_score":5,"time_horizon":"short_term"}\n```';
    const client = makeMockClient(mockResponse);
    const result = await classifyJtbd('increase my revenue', {}, client);
    assert.ok(result, 'result should not be null');
    assert.equal(result.jtbd_category, 'grow_income');
  });

  test('returns null when client throws', async () => {
    const errorClient = {
      messages: { async create() { throw new Error('API error'); } },
    };
    const result = await classifyJtbd('text', {}, errorClient);
    assert.equal(result, null);
  });

  test('returns null when response JSON is malformed', async () => {
    const client = makeMockClient('not json at all');
    const result = await classifyJtbd('text', {}, client);
    assert.equal(result, null);
  });

  test('returns null when required keys are missing', async () => {
    const client = makeMockClient('{"topic_clusters":["a"]}');
    const result = await classifyJtbd('text', {}, client);
    assert.equal(result, null);
  });

  test('coerces urgency_score to number', async () => {
    const client = makeMockClient('{"jtbd_category":"personal_development","topic_clusters":[],"urgency_score":"7","time_horizon":"long_term"}');
    const result = await classifyJtbd('learn a new skill', {}, client);
    assert.ok(result);
    assert.equal(typeof result.urgency_score, 'number');
    assert.equal(result.urgency_score, 7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /srv/projects/marble && node --test test/onboarding.nlp.test.js 2>&1 | tail -20
```

Expected: all tests fail — `nlp-pipeline.js` does not exist.

- [ ] **Step 3: Create core/onboarding/nlp-pipeline.js**

```js
/**
 * JTBD intent classification for onboarding freeform text.
 * Uses Claude Haiku for speed and cost efficiency.
 * Accepts an injected client for testing.
 */

/**
 * @typedef {Object} JtbdClassification
 * @property {string} jtbd_category
 * @property {string[]} topic_clusters
 * @property {number} urgency_score
 * @property {string} time_horizon
 */

const PROMPT_TEMPLATE = (text, context) =>
  `Analyze this user statement and return JSON only.

User statement: "${text.replace(/"/g, '\\"').slice(0, 120)}"
User context: role=${context.role || 'unknown'}, ageBracket=${context.ageBracket || 'unknown'}

Return exactly this JSON structure with no other text:
{
  "jtbd_category": "grow_income|protect_assets|manage_costs|build_something|personal_development",
  "topic_clusters": ["topic1", "topic2"],
  "urgency_score": 0,
  "time_horizon": "immediate|short_term|long_term"
}`;

/**
 * Classifies freeform JTBD text using Claude Haiku.
 * Returns null on any failure — callers should treat null as "classification unavailable".
 *
 * @param {string} text
 * @param {{ role?: string, ageBracket?: string }} context
 * @param {object|null} [client] - injected Anthropic client (for tests); created from env if null
 * @returns {Promise<JtbdClassification|null>}
 */
export async function classifyJtbd(text, context = {}, client = null) {
  if (!client && !process.env.ANTHROPIC_API_KEY) return null;

  try {
    if (!client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: PROMPT_TEMPLATE(text, context) }],
    });

    const raw = response.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (!parsed.jtbd_category || !Array.isArray(parsed.topic_clusters)) return null;

    return {
      jtbd_category:  String(parsed.jtbd_category),
      topic_clusters: parsed.topic_clusters.map(String),
      urgency_score:  Number(parsed.urgency_score) || 0,
      time_horizon:   String(parsed.time_horizon || 'short_term'),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /srv/projects/marble && node --test test/onboarding.nlp.test.js 2>&1 | tail -20
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /srv/projects/marble && git add core/onboarding/nlp-pipeline.js test/onboarding.nlp.test.js && git commit -m "feat: add Claude Haiku JTBD NLP pipeline for onboarding freeform text"
```

---

## Task 6: apply-to-kg.js — wire fire-and-forget NLP + Wikidata

**Files:**
- Modify: `core/onboarding/apply-to-kg.js`
- Modify: `test/onboarding.deterministic.test.js`

- [ ] **Step 1: Write failing tests**

Add to `test/onboarding.deterministic.test.js`:

```js
import { applyPersonaEnrichment } from '../core/onboarding/apply-to-kg.js';

describe('applyPersonaEnrichment', () => {
  test('writes NLP classification beliefs to KG when provided', async () => {
    const kg = makeMockKg();
    const mockClassify = async () => ({
      jtbd_category: 'build_something',
      topic_clusters: ['startup', 'product'],
      urgency_score: 8,
      time_horizon: 'immediate',
    });
    await applyPersonaEnrichment(kg, { freeform: 'launch my MVP' }, { classifyFn: mockClassify });

    const jtbdCat = kg._store.beliefs.find(b => b.topic === 'jtbd:category');
    assert.ok(jtbdCat, 'jtbd:category belief missing');
    assert.equal(jtbdCat.claim, 'build_something');

    const urgency = kg._store.beliefs.find(b => b.topic === 'jtbd:urgency');
    assert.ok(urgency, 'jtbd:urgency belief missing');
    assert.equal(urgency.claim, '8');

    const clusterInterest = kg._store.interests['cluster:startup'];
    assert.ok(clusterInterest > 0, 'cluster interest missing');
  });

  test('skips NLP when freeform is absent', async () => {
    const kg = makeMockKg();
    let called = false;
    const mockClassify = async () => { called = true; return null; };
    await applyPersonaEnrichment(kg, {}, { classifyFn: mockClassify });
    assert.equal(called, false);
  });

  test('does not throw when NLP returns null', async () => {
    const kg = makeMockKg();
    const mockClassify = async () => null;
    await assert.doesNotReject(
      applyPersonaEnrichment(kg, { freeform: 'some text' }, { classifyFn: mockClassify })
    );
  });

  test('writes Wikidata static QID interests when passions present', async () => {
    const kg = makeMockKg();
    await applyPersonaEnrichment(kg, { passions: ['technology'] }, {
      wikidataFn: async (kgArg, passions) => {
        kgArg.boostInterest('wikidata:Q11661', 0.5);
      },
    });
    assert.ok(kg._store.interests['wikidata:Q11661'] > 0);
  });

  test('skips Wikidata when passions absent', async () => {
    const kg = makeMockKg();
    let called = false;
    await applyPersonaEnrichment(kg, {}, {
      wikidataFn: async () => { called = true; },
    });
    assert.equal(called, false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js 2>&1 | grep -E "fail|applyPersonaEnrichment" | head -10
```

Expected: `applyPersonaEnrichment is not exported` errors.

- [ ] **Step 3: Add applyPersonaEnrichment to apply-to-kg.js**

Add this function at the end of `core/onboarding/apply-to-kg.js` (keep all existing code, just append):

```js
/**
 * Fire-and-forget async enrichment: NLP classification + Wikidata linking.
 * Both are best-effort — failures are swallowed, KG is not rolled back.
 *
 * @param {import('../kg.js').KnowledgeGraph} kg
 * @param {Partial<import('./schema.js').OnboardingAnswers>} answers
 * @param {{ classifyFn?: Function, wikidataFn?: Function }} [opts]
 */
export async function applyPersonaEnrichment(kg, answers, opts = {}) {
  const {
    classifyFn = null,
    wikidataFn = null,
  } = opts;

  // ── NLP: classify freeform JTBD text ──
  if (answers.freeform && answers.freeform.trim()) {
    try {
      const classify = classifyFn ?? (await import('./nlp-pipeline.js')).classifyJtbd;
      const result = await classify(answers.freeform, {
        role: answers.professional,
        ageBracket: answers.ageBracket,
      });
      if (result) {
        kg.addBelief('jtbd:category', result.jtbd_category, 0.8);
        kg.addBelief('jtbd:urgency',  String(result.urgency_score), 0.7);
        for (const cluster of result.topic_clusters) {
          const topic = `cluster:${cluster.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          kg.boostInterest(topic, 0.6);
        }
      }
    } catch {
      // NLP enrichment is best-effort
    }
  }

  // ── Wikidata: link passion QIDs ──
  if (answers.passions && answers.passions.length > 0) {
    try {
      const enrich = wikidataFn ?? (await import('./wikidata.js')).enrichWithWikidata;
      await enrich(kg, answers.passions);
    } catch {
      // Wikidata enrichment is best-effort
    }
  }
}
```

- [ ] **Step 4: Run all tests to verify everything passes**

```bash
cd /srv/projects/marble && node --test test/onboarding.deterministic.test.js test/onboarding.nlp.test.js 2>&1 | tail -30
```

Expected: all tests pass across both files.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd /srv/projects/marble && npm test 2>&1 | tail -20
```

Expected: all existing tests continue to pass.

- [ ] **Step 6: Commit**

```bash
cd /srv/projects/marble && git add core/onboarding/apply-to-kg.js test/onboarding.deterministic.test.js && git commit -m "feat: wire NLP and Wikidata fire-and-forget enrichment in apply-to-kg"
```

---

## Done

All 6 tasks complete. The wizard now has 13 steps. Run `npm test` for a final green-light check.
