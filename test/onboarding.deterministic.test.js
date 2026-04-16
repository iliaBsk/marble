import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateOnboardingAnswers,
  MARITAL_STATUS_OPTIONS,
  KIDS_OPTIONS,
} from '../core/onboarding/schema.js';
import { answersToKgSeed } from '../core/onboarding/to-kg.js';
import { applyOnboardingToKg } from '../core/onboarding/apply-to-kg.js';
import { getShopsForCity, getKnownCities } from '../core/onboarding/shops-registry.js';

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

  test('rejects freeform over 280 chars', () => {
    const result = validateOnboardingAnswers({ ...VALID_ANSWERS, freeform: 'x'.repeat(281) });
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
