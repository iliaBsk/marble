import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { runDeepResearch } from '../core/onboarding/deep-research.js';
import { applyEnrichmentToKg } from '../core/onboarding/apply-to-kg.js';

const VALID_ANSWERS = {
  maritalStatus: 'married',
  kids: 'has_young',
  movieGenres: ['sci-fi', 'drama'],
  foodPreferences: ['mediterranean', 'vegan'],
  allergies: ['gluten'],
  location: { city: 'Barcelona' },
  favoriteShops: ['Zara', 'Mango'],
  travel: { regions: ['EU'], summerTypes: ['beach'], winterTypes: ['skiing'] },
};

const SAMPLE_ENRICHMENT = {
  beliefs: [
    { topic: 'profession', claim: 'likely works in tech or design', strength: 0.55 },
    { topic: 'income_bracket', claim: 'upper-middle income', strength: 0.45 },
  ],
  preferences: [
    { type: 'content_topic', description: 'architecture and urban design', strength: 0.5 },
    { type: 'content_topic', description: 'sustainable living', strength: 0.55 },
  ],
  identities: [
    { role: 'consumer_archetype', context: 'urban professional', salience: 0.6 },
  ],
  interests: [
    { topic: 'urban:barcelona', amount: 0.35 },
    { topic: 'sustainability', amount: 0.3 },
  ],
  confidence: {
    lifestyle: 0.6,
    technology: 0.55,
    culture: 0.5,
  },
};

function makeCannedClient(responseText, { failParse = false, failRequest = false, abort = false } = {}) {
  return {
    responses: {
      async create(params, opts) {
        if (abort && opts?.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        if (failRequest) throw new Error('Network error');

        const text = failParse ? 'not valid json' : responseText;
        return {
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text },
                { type: 'output_text', annotations: [] },
              ],
            },
          ],
        };
      },
    },
  };
}

function makeMockKg() {
  const store = {
    beliefs: [
      // Per-allergy topics (dietary_restriction:<name>) — high-strength to test skip logic
      { topic: 'dietary_restriction:gluten', claim: 'avoids gluten', strength: 0.95, valid_to: null },
    ],
    preferences: [],
    identities: [],
    interests: {},
    confidence: {},
  };

  return {
    _store: store,
    addBelief(topic, claim, strength) {
      const existing = store.beliefs.find(b => b.topic === topic && !b.valid_to);
      if (existing && existing.claim === claim) { existing.strength = strength; return; }
      if (existing) existing.valid_to = new Date().toISOString();
      store.beliefs.push({ topic, claim, strength, valid_to: null });
    },
    getBelief(topic) {
      return store.beliefs.find(b => b.topic === topic && !b.valid_to) || null;
    },
    addPreference(type, description, strength) {
      const existing = store.preferences.find(p => p.type === type &&
        p.description.toLowerCase() === description.toLowerCase() && !p.valid_to);
      if (existing) { existing.strength = strength; return; }
      store.preferences.push({ type, description, strength, valid_to: null });
    },
    getPreferences(type) {
      return store.preferences.filter(p => p.type === type && !p.valid_to);
    },
    addIdentity(role, context, salience) {
      const existing = store.identities.find(i => i.role === role && !i.valid_to);
      if (existing) { existing.salience = salience; return; }
      store.identities.push({ role, context, salience, valid_to: null });
    },
    getIdentities() { return store.identities.filter(i => !i.valid_to); },
    boostInterest(topic, amount) { store.interests[topic] = (store.interests[topic] || 0) + amount; },
    setDomainConfidence(domain, conf) { store.confidence[domain] = conf; },
    getDomainConfidence(domain) { return store.confidence[domain] ?? 0.5; },
  };
}

describe('runDeepResearch', () => {
  test('happy path: parses enrichment from canned JSON response', async () => {
    const json = JSON.stringify(SAMPLE_ENRICHMENT);
    const client = makeCannedClient(`\`\`\`json\n${json}\n\`\`\``);

    const enrichment = await runDeepResearch({ answers: VALID_ANSWERS, client });

    assert.ok(enrichment.beliefs.length >= 1);
    assert.ok(enrichment.preferences.length >= 1);
    assert.ok(enrichment.identities.length >= 1);
    assert.ok(enrichment.interests.length >= 1);
    assert.ok(typeof enrichment.confidence === 'object');
    assert.ok(Array.isArray(enrichment.citations));
  });

  test('parses bare JSON without code fence', async () => {
    const json = JSON.stringify(SAMPLE_ENRICHMENT);
    const client = makeCannedClient(json);

    const enrichment = await runDeepResearch({ answers: VALID_ANSWERS, client });
    assert.ok(enrichment.beliefs.length >= 1);
  });

  test('returns empty enrichment when JSON cannot be parsed after retry', async () => {
    const client = makeCannedClient('', { failParse: true });
    const enrichment = await runDeepResearch({ answers: VALID_ANSWERS, client });
    assert.deepEqual(enrichment.beliefs, []);
    assert.deepEqual(enrichment.preferences, []);
  });

  test('throws AbortError on aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = makeCannedClient('', { abort: true });

    await assert.rejects(
      () => runDeepResearch({ answers: VALID_ANSWERS, client, signal: controller.signal }),
      err => err.name === 'AbortError' || err.message.includes('abort') || err.message.includes('aborted')
    );
  });

  test('throws if OPENAI_API_KEY missing and no client provided', async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await assert.rejects(
        () => runDeepResearch({ answers: VALID_ANSWERS }),
        /OPENAI_API_KEY/
      );
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });

  test('citations array flows through from response annotations', async () => {
    const client = {
      responses: {
        async create() {
          return {
            output: [{
              type: 'message',
              content: [{
                type: 'output_text',
                text: JSON.stringify(SAMPLE_ENRICHMENT),
                annotations: [
                  { type: 'url_citation', url: 'https://example.com/barcelona-lifestyle' },
                  { type: 'url_citation', url: 'https://example.com/zara-consumer' },
                ],
              }],
            }],
          };
        },
      },
    };

    const enrichment = await runDeepResearch({ answers: VALID_ANSWERS, client });
    assert.ok(enrichment.citations.length >= 2);
    assert.ok(enrichment.citations[0].startsWith('https://'));
  });
});

describe('applyEnrichmentToKg', () => {
  test('writes enrichment to KG', () => {
    const kg = makeMockKg();
    const counts = applyEnrichmentToKg(kg, SAMPLE_ENRICHMENT);
    assert.ok(counts.preferences > 0);
    assert.ok(counts.identities > 0);
    assert.ok(counts.interests > 0);
  });

  test('does not overwrite high-strength dietary_restriction belief', () => {
    const kg = makeMockKg();
    // kg already has dietary_restriction:gluten at 0.95

    applyEnrichmentToKg(kg, {
      beliefs: [{ topic: 'dietary_restriction:gluten', claim: 'avoids gluten (inferred)', strength: 0.5 }],
    });

    // The original high-strength belief should be intact
    const belief = kg.getBelief('dietary_restriction:gluten');
    assert.equal(belief.strength, 0.95);
  });

  test('caps enrichment belief strength at 0.7', () => {
    const kg = makeMockKg();
    applyEnrichmentToKg(kg, {
      beliefs: [{ topic: 'profession', claim: 'software engineer', strength: 0.99 }],
    });

    const belief = kg._store.beliefs.find(b => b.topic === 'profession' && !b.valid_to);
    assert.ok(belief.strength <= 0.7, `Strength ${belief.strength} should be capped at 0.7`);
  });

  test('caps enrichment preference strength at 0.6', () => {
    const kg = makeMockKg();
    applyEnrichmentToKg(kg, {
      preferences: [{ type: 'content_topic', description: 'finance', strength: 0.99 }],
    });

    const pref = kg._store.preferences.find(
      p => p.type === 'content_topic' && p.description === 'finance' && !p.valid_to
    );
    assert.ok(pref.strength <= 0.6, `Strength ${pref.strength} should be capped at 0.6`);
  });

  test('handles empty enrichment gracefully', () => {
    const kg = makeMockKg();
    const counts = applyEnrichmentToKg(kg, {});
    assert.equal(counts.beliefs, 0);
    assert.equal(counts.preferences, 0);
  });
});
