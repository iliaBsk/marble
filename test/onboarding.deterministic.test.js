import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateOnboardingAnswers,
  MARITAL_STATUS_OPTIONS,
  KIDS_OPTIONS,
  PROFESSIONAL_OPTIONS,
  FINANCIAL_MINDSET_OPTIONS,
  PASSION_OPTIONS,
  AGE_BRACKET_OPTIONS,
} from '../core/onboarding/schema.js';
import { answersToKgSeed } from '../core/onboarding/to-kg.js';
import { applyOnboardingToKg } from '../core/onboarding/apply-to-kg.js';
import { getShopsForCity, getKnownCities } from '../core/onboarding/shops-registry.js';
import { STEPS, getStep } from '../core/onboarding/steps.js';

// ── Fixtures ─────────────────────────────────────────────────

const VALID_ANSWERS = {
  maritalStatus: 'married',
  kids: 'has_young',
  movieGenres: ['sci-fi', 'drama'],
  foodPreferences: ['mediterranean', 'vegan'],
  allergies: ['gluten', 'dairy'],
  location: { city: 'Barcelona', country: 'Spain' },
  favoriteShops: ['Zara', 'Mango', 'Decathlon'],
  travel: { regions: ['EU', 'Asia'], summerTypes: ['beach'], winterTypes: ['skiing'] },
  freeform: 'I love reading tech newsletters.',
};

// Minimal mock KG that tracks calls to its public methods
function makeMockKg() {
  const store = { beliefs: [], preferences: [], identities: [], interests: {}, confidence: {} };

  return {
    _store: store,
    addBelief(topic, claim, strength) {
      const existing = store.beliefs.find(b => b.topic === topic && !b.valid_to);
      if (existing) {
        if (existing.claim === claim) { existing.strength = strength; return; }
        existing.valid_to = new Date().toISOString();
      }
      store.beliefs.push({ topic, claim, strength, valid_to: null });
    },
    getBelief(topic) {
      return store.beliefs.find(b => b.topic === topic && !b.valid_to) || null;
    },
    addPreference(type, description, strength) {
      const existing = store.preferences.find(p =>
        p.type === type && p.description.toLowerCase() === description.toLowerCase() && !p.valid_to
      );
      if (existing) { existing.strength = strength; return; }
      store.preferences.push({ type, description, strength, valid_to: null });
    },
    getPreferences(type) {
      return store.preferences.filter(p => p.type === type && !p.valid_to);
    },
    addIdentity(role, context, salience) {
      const existing = store.identities.find(i => i.role === role && !i.valid_to);
      if (existing) {
        if (existing.context === context) { existing.salience = salience; return; }
        existing.valid_to = new Date().toISOString();
      }
      store.identities.push({ role, context, salience, valid_to: null });
    },
    getIdentities() { return store.identities.filter(i => !i.valid_to); },
    boostInterest(topic, amount) {
      store.interests[topic] = (store.interests[topic] || 0) + amount;
    },
    setDomainConfidence(domain, conf) {
      store.confidence[domain] = conf;
    },
    getDomainConfidence(domain) {
      return store.confidence[domain] ?? 0.5;
    },
    getMemoryNodesSummary() {
      return {
        beliefs: store.beliefs.filter(b => !b.valid_to),
        preferences: store.preferences.filter(p => !p.valid_to),
        identities: store.identities.filter(i => !i.valid_to),
        confidence: store.confidence,
      };
    },
  };
}

// ── Schema validation ─────────────────────────────────────────

describe('validateOnboardingAnswers', () => {
  test('accepts valid answers', () => {
    const result = validateOnboardingAnswers(VALID_ANSWERS);
    assert.equal(result.ok, true);
  });

  test('rejects null input', () => {
    const result = validateOnboardingAnswers(null);
    assert.equal(result.ok, false);
  });

  test('rejects unknown maritalStatus', () => {
    const result = validateOnboardingAnswers({ ...VALID_ANSWERS, maritalStatus: 'complicated' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('maritalStatus')));
  });

  test('rejects unknown kids value', () => {
    const result = validateOnboardingAnswers({ ...VALID_ANSWERS, kids: 'teenager' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('kids')));
  });

  test('rejects missing location.city', () => {
    const result = validateOnboardingAnswers({
      ...VALID_ANSWERS,
      location: { country: 'Spain' },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('location.city')));
  });

  test('rejects empty movieGenres', () => {
    const result = validateOnboardingAnswers({ ...VALID_ANSWERS, movieGenres: [] });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('movieGenres')));
  });

  test('rejects freeform over 120 chars', () => {
    const result = validateOnboardingAnswers({ ...VALID_ANSWERS, freeform: 'x'.repeat(121) });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.includes('freeform')));
  });

  test('allows freeform to be omitted', () => {
    const { freeform: _, ...noFreeform } = VALID_ANSWERS;
    const result = validateOnboardingAnswers(noFreeform);
    assert.equal(result.ok, true);
  });

  test('exports all expected enum constants', () => {
    assert.ok(MARITAL_STATUS_OPTIONS.includes('married'));
    assert.ok(KIDS_OPTIONS.includes('has_young'));
  });
});

// ── answersToKgSeed ───────────────────────────────────────────

describe('answersToKgSeed', () => {
  const seed = answersToKgSeed(VALID_ANSWERS);

  test('produces identities for relationship_status and parental_status', () => {
    const roles = seed.identities.map(i => i.role);
    assert.ok(roles.includes('relationship_status'));
    assert.ok(roles.includes('parental_status'));
  });

  test('relationship_status identity reflects answer', () => {
    const id = seed.identities.find(i => i.role === 'relationship_status');
    assert.equal(id.context, 'married');
    assert.ok(id.salience >= 0.8);
  });

  test('produces dietary_restriction belief for each allergy', () => {
    const beliefs = seed.beliefs.filter(b => b.topic.startsWith('dietary_restriction:'));
    assert.ok(beliefs.some(b => b.claim.includes('gluten')));
    assert.ok(beliefs.some(b => b.claim.includes('dairy')));
  });

  test('allergy beliefs have strength >= 0.95', () => {
    const beliefs = seed.beliefs.filter(b => b.topic.startsWith('dietary_restriction:'));
    for (const b of beliefs) assert.ok(b.strength >= 0.95, `strength ${b.strength} < 0.95`);
  });

  test('gap beliefs are present for all 6 gap topics', () => {
    const gapTopics = seed.gaps.map(g => g.topic);
    assert.ok(gapTopics.some(t => t === 'gap:profession'));
    assert.ok(gapTopics.some(t => t === 'gap:income_bracket'));
    assert.ok(gapTopics.some(t => t === 'gap:fitness_habits'));
    assert.ok(gapTopics.some(t => t === 'gap:media_depth'));
    assert.equal(seed.gaps.length, 6);
  });

  test('gap beliefs have low strength (for clone seeding)', () => {
    for (const g of seed.gaps) assert.ok(g.strength <= 0.3);
  });

  test('location identity contains the city', () => {
    const locId = seed.identities.find(i => i.role === 'location');
    assert.ok(locId, 'location identity missing');
    assert.equal(locId.context, 'Barcelona');
  });

  test('produces genre_preference entries for each movie genre', () => {
    const genrePrefs = seed.preferences.filter(p => p.type === 'genre_preference');
    assert.ok(genrePrefs.some(p => p.description === 'sci-fi'));
    assert.ok(genrePrefs.some(p => p.description === 'drama'));
  });

  test('produces brand_preference for each shop', () => {
    const brands = seed.preferences.filter(p => p.type === 'brand_preference');
    assert.ok(brands.some(p => p.description === 'Zara'));
    assert.ok(brands.some(p => p.description === 'Decathlon'));
  });

  test('travel_style preferences include summer and winter', () => {
    const styles = seed.preferences.filter(p => p.type === 'travel_style');
    assert.ok(styles.some(p => p.description.startsWith('summer:')));
    assert.ok(styles.some(p => p.description.startsWith('winter:')));
  });
});

// ── applyOnboardingToKg ───────────────────────────────────────

describe('applyOnboardingToKg', () => {
  test('writes all seed categories to KG', () => {
    const kg = makeMockKg();
    const seed = answersToKgSeed(VALID_ANSWERS);
    const counts = applyOnboardingToKg(kg, seed);

    assert.ok(counts.beliefs > 0);
    assert.ok(counts.preferences > 0);
    assert.ok(counts.identities > 0);
    assert.ok(counts.interests > 0);
    assert.ok(counts.gaps > 0);
  });

  test('running twice does not create duplicate preferences', () => {
    const kg = makeMockKg();
    const seed = answersToKgSeed(VALID_ANSWERS);
    applyOnboardingToKg(kg, seed);
    applyOnboardingToKg(kg, seed); // second run

    const brands = kg._store.preferences.filter(
      p => p.type === 'brand_preference' && !p.valid_to
    );
    // Should not have doubled up
    const zaraEntries = brands.filter(p => p.description === 'Zara');
    assert.equal(zaraEntries.length, 1);
  });

  test('dietary_restriction beliefs have strength >= 0.95 in the KG', () => {
    const kg = makeMockKg();
    const seed = answersToKgSeed(VALID_ANSWERS);
    applyOnboardingToKg(kg, seed);

    // Each allergy gets its own topic (dietary_restriction:<name>) to avoid contradiction detection
    const beliefs = kg._store.beliefs.filter(
      b => b.topic.startsWith('dietary_restriction:') && !b.valid_to
    );
    assert.ok(beliefs.length >= 2, `Expected ≥2 allergy beliefs, got ${beliefs.length}`);
    for (const b of beliefs) assert.ok(b.strength >= 0.95, `strength ${b.strength} < 0.95`);
  });

  test('gap beliefs are readable via gap: prefix filter', () => {
    const kg = makeMockKg();
    const seed = answersToKgSeed(VALID_ANSWERS);
    applyOnboardingToKg(kg, seed);

    const gaps = kg._store.beliefs.filter(b => b.topic.startsWith('gap:') && !b.valid_to);
    assert.ok(gaps.length >= 4, `Expected ≥4 gap beliefs, got ${gaps.length}`);
  });
});

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

// ── shops-registry ────────────────────────────────────────────

describe('getShopsForCity', () => {
  test('returns shops for Barcelona (case insensitive)', () => {
    const shops = getShopsForCity('Barcelona');
    assert.ok(shops.length >= 6);
    assert.ok(shops.some(s => s.name === 'Zara'));
    assert.ok(shops.some(s => s.name === 'Mango'));
  });

  test('normalises accented city names', () => {
    const a = getShopsForCity('Barcelona');
    const b = getShopsForCity('barcelona');
    assert.deepEqual(a, b);
  });

  test('returns empty array for unknown city', () => {
    const shops = getShopsForCity('Atlantis');
    assert.deepEqual(shops, []);
  });

  test('returns empty array for empty string', () => {
    assert.deepEqual(getShopsForCity(''), []);
  });

  test('getKnownCities returns at least 8 cities', () => {
    const cities = getKnownCities();
    assert.ok(cities.length >= 8);
  });
});

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

  test('exports FINANCIAL_MINDSET_OPTIONS with 4 entries', () => {
    assert.equal(FINANCIAL_MINDSET_OPTIONS.length, 4);
    assert.ok(FINANCIAL_MINDSET_OPTIONS.includes('grow_income'));
  });

  test('exports AGE_BRACKET_OPTIONS with 5 entries', () => {
    assert.equal(AGE_BRACKET_OPTIONS.length, 5);
    assert.ok(AGE_BRACKET_OPTIONS.includes('60s+'));
  });
});

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
