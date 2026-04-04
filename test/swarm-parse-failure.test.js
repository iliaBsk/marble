/**
 * swarm-parse-failure.test.js
 *
 * Verifies swarm agent JSON parsing behavior (Fix 4: cascading extraction).
 *
 * Fenced JSON is now recovered via cascading extraction — score > 0, source 'llm'.
 * Completely unparseable output still fails loud — score 0, source 'parse_failed'.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { explodeAgentQuestions, Swarm, AGENT_LENSES } from '../core/swarm.js';

// ── Mock LLM client factory ────────────────────────────────────────────────

function makeMockClient(responseText) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: responseText }]
      })
    }
  };
}

const AGENT_SPEC = {
  name: 'test_agent',
  exclusive_dimension: 'subject_matter',
  motivation_frame: 'Test motivation',
  screening_question: 'Is this relevant?',
  positive_signals: ['ai', 'machine learning'],
  negative_signals: ['sports'],
  interest_anchors: ['technology'],
};

// Long enough content to bypass sparse-content gate (< 40 words)
const CONTENT_SAMPLE = `
This is a detailed article about artificial intelligence and machine learning.
It covers recent breakthroughs in large language models, their applications in industry,
and the broader implications for software development workflows. The piece is aimed at
engineers who want to understand what frontier AI means for their day-to-day work.
It references specific benchmarks, empirical results, and practical deployment tips.
`.trim();

const KG_SUMMARY = {
  interests: ['AI', 'machine learning', 'software engineering'],
  history: [],
};

// ── Capture warnings ───────────────────────────────────────────────────────

let warnMessages = [];
let originalWarn;

before(() => {
  originalWarn = console.warn;
  console.warn = (...args) => {
    warnMessages.push(args.join(' '));
    originalWarn(...args);
  };
});

after(() => {
  console.warn = originalWarn;
});

function clearWarnings() {
  warnMessages = [];
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('swarm parse-failure: cascading extraction (Fix 4)', () => {

  it('explodeAgentQuestions: fenced JSON → extracted successfully, score > 0, source llm, no warning', async () => {
    clearWarnings();
    const fencedResponse = '```json\n[{"question":"Is it relevant?","fired":true,"confidence":0.9,"evidence":"test"}]\n```';
    const mockLlm = makeMockClient(fencedResponse);

    const result = await explodeAgentQuestions(AGENT_SPEC, CONTENT_SAMPLE, KG_SUMMARY, mockLlm, { forceLLM: true });

    assert.equal(result.source, 'llm', 'source must be llm — fenced JSON is now extracted, not rejected');
    assert.ok(result.score > 0, `score must be > 0 when fenced JSON is successfully extracted (got ${result.score})`);
    assert.ok(result.questions.length > 0, 'questions should be populated after successful extraction');

    const fencedWarn = warnMessages.find(m => m.includes('fenced JSON') && m.includes('test_agent'));
    assert.equal(fencedWarn, undefined, `No fenced-JSON warning expected for successful extraction, got: ${fencedWarn}`);
  });

  it('explodeAgentQuestions: invalid JSON → score 0, source parse_failed, warning logged', async () => {
    clearWarnings();
    const badResponse = 'Sure! Here are my evaluations: yes it is relevant, no it is not too long.';
    const mockLlm = makeMockClient(badResponse);

    const result = await explodeAgentQuestions(AGENT_SPEC, CONTENT_SAMPLE, KG_SUMMARY, mockLlm, { forceLLM: true });

    assert.equal(result.score, 0, 'score must be 0 when LLM returns invalid JSON');
    assert.equal(result.source, 'parse_failed', 'source must be parse_failed');
    assert.equal(result.questions.length, 0, 'no questions should be populated');

    const parseWarn = warnMessages.find(m => m.includes('test_agent') && (m.includes('unparseable') || m.includes('parse') || m.includes('failed')));
    assert.ok(parseWarn, `Expected a console.warn about parse failure. Got: ${JSON.stringify(warnMessages)}`);
    assert.ok(parseWarn.includes('test_agent'), 'Warning must name the agent');
  });

  it('explodeAgentQuestions: valid plain JSON → score > 0, no warning', async () => {
    clearWarnings();
    const validResponse = JSON.stringify([
      { question: 'Does this cover AI topics?', fired: true, confidence: 0.9, evidence: 'article is about AI' },
      { question: 'Is this aimed at engineers?', fired: true, confidence: 0.8, evidence: 'mentions software development' },
      { question: 'Does it avoid sports content?', fired: true, confidence: 0.95, evidence: 'no sports mentioned' },
    ]);
    const mockLlm = makeMockClient(validResponse);

    const result = await explodeAgentQuestions(AGENT_SPEC, CONTENT_SAMPLE, KG_SUMMARY, mockLlm, { forceLLM: true });

    assert.equal(result.source, 'llm', 'source must be llm for successful parse');
    assert.ok(result.score > 0, `score should be > 0 for valid response (got ${result.score})`);
    assert.ok(result.questions.length > 0, 'questions should be populated');

    const anyWarn = warnMessages.find(m => m.includes('test_agent'));
    assert.equal(anyWarn, undefined, `No warning expected for valid response, got: ${anyWarn}`);
  });

  it('Swarm#deepEvaluation: fenced JSON → extracted by Fix 4, agents score picks, curate returns results', async () => {
    clearWarnings();
    const fencedResponse = '```json\n{"picks":[{"index":1,"score":0.9,"reason":"great"}]}\n```';

    const mockKg = { interests: {}, history: [], context: {}, patterns: {}, source_trust: {} };
    const swarm = new Swarm(mockKg, {
      mode: 'deep',
      llm: async () => fencedResponse,
      topN: 10,
    });
    // Patch clone so it works without real KG data
    swarm.clone.takeSnapshot = () => {};
    swarm.clone._snapshot = {
      interests: {},
      context: { projects: [], calendar: [], conversations: [] },
      patterns: { loves: [], avoids: [] },
      source_trust: {},
    };
    swarm.clone.wouldEngage = () => 0.5;

    const stories = [
      { id: 's1', title: 'Test Story', summary: 'A test story about AI', source: 'test', topics: ['AI'] }
    ];

    const result = await swarm.curate(stories);

    // Fix 4: fenced JSON is extracted, agents score picks → curate returns results
    assert.ok(result.length > 0, `curate result should be non-empty when fenced JSON is extracted (Fix 4). Got length: ${result.length}`);

    // Fix 4 logs fence-extraction as a soft warning (counted failure), not a hard skip
    const fencedWarn = warnMessages.find(m => m.includes('fence'));
    assert.ok(fencedWarn, `Expected a console.warn about fenced extraction. Got: ${JSON.stringify(warnMessages)}`);
  });

  it('Swarm#curate: truncated JSON (token-limit cut-off) → partial recovery returns >=1 pick', async () => {
    clearWarnings();
    // Simulates a Contrarian Agent response cut off mid-string by token limit
    const truncatedResponse = '{ "picks": [{ "index": 1, "score": 0.9, "reason": "Combining comedy with drama, \'Cool Hand Luke\'...';

    const mockKg = { interests: {}, history: [], context: {}, patterns: {}, source_trust: {} };
    const swarm = new Swarm(mockKg, {
      mode: 'deep',
      llm: async () => truncatedResponse,
      topN: 10,
    });
    swarm.clone.takeSnapshot = () => {};
    swarm.clone._snapshot = {
      interests: {},
      context: { projects: [], calendar: [], conversations: [] },
      patterns: { loves: [], avoids: [] },
      source_trust: {},
    };
    swarm.clone.wouldEngage = () => 0.5;

    const stories = [
      { id: 's1', title: 'Cool Hand Luke', summary: 'Classic drama-comedy film.', source: 'test', topics: ['film'] }
    ];

    const result = await swarm.curate(stories);

    assert.ok(result.length > 0, `partial recovery should yield >=1 result (got ${result.length})`);
    const recoveryWarn = warnMessages.find(m => m.includes('partial recovery'));
    assert.ok(recoveryWarn, `Expected a console.warn about partial recovery. Got: ${JSON.stringify(warnMessages)}`);
  });

});
