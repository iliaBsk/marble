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
