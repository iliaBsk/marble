/**
 * investigative-integration.test.mjs
 *
 * Integration test: facts → investigate → gaps → clones → feedback → evolution
 *
 * Scenario: seed user is 37, Barcelona, runner, on TRT.
 * InvestigativeCommittee must generate non-trivial questions.
 * Gaps found → clones seeded (speed vs endurance, cut vs bulk, etc.)
 * Simulate reactions → wrong clone dies, correct clone confidence rises.
 */

import assert from 'node:assert/strict';
import { KnowledgeGraph } from '../core/kg.js';
import { InvestigativeCommittee } from '../core/investigative-committee.js';
import { CuriosityLoop } from '../core/curiosity-loop.js';
import { ClonePopulation } from '../core/evolution.js';

// ─── Stub LLM ───────────────────────────────────────────────────────────────
// Simulates an LLM that behaves deterministically for the test.

let _llmCallCount = 0;

async function stubLLM(prompt) {
  _llmCallCount++;

  // Question generation: return questions that probe running goals
  if (prompt.includes('generate up to') || prompt.includes('generate questions')) {
    if (_llmCallCount <= 2) {
      return JSON.stringify([
        'Why does this person run — is it for speed, endurance, or body composition?',
        'What is driving their interest in TRT — performance, health, or aesthetics?',
        'Are they training for a specific event or following a general fitness routine?'
      ]);
    }
    // Round 2: no more useful questions
    return '[]';
  }

  // Answer questions (data source returns nothing meaningful → gaps)
  if (prompt.startsWith('Question:')) {
    return 'null';
  }

  // Clone seeding: return archetype clones for each gap
  if (prompt.includes('archetype model')) {
    return JSON.stringify([
      {
        gap: 'Why does this person run — is it for speed, endurance, or body composition?',
        hypothesis: 'Alex is training for ultra endurance — long distances, low heart rate zones',
        kgOverrides: {
          beliefs: [{ topic: 'running_goal', value: 'endurance', confidence: 0.7 }],
          preferences: [{ category: 'training_style', value: 'long_slow_distance', strength: 0.7 }],
          identities: [{ role: 'athlete_type', value: 'endurance_runner', salience: 0.7 }]
        },
        confidence: 0.5
      },
      {
        gap: 'Why does this person run — is it for speed, endurance, or body composition?',
        hypothesis: 'Alex is training for speed — interval work, 5K/10K performance',
        kgOverrides: {
          beliefs: [{ topic: 'running_goal', value: 'speed', confidence: 0.7 }],
          preferences: [{ category: 'training_style', value: 'interval_training', strength: 0.7 }],
          identities: [{ role: 'athlete_type', value: 'speed_runner', salience: 0.7 }]
        },
        confidence: 0.5
      }
    ]);
  }

  // Clone fitness evaluation: endurance clone predicts correctly for long run content
  if (prompt.includes('endurance_runner') || prompt.includes('long_slow_distance')) {
    // Endurance clone → says yes to endurance content
    if (prompt.includes('marathon') || prompt.includes('trail') || prompt.includes('ultra')) {
      return 'yes';
    }
    return 'no';
  }

  if (prompt.includes('speed_runner') || prompt.includes('interval_training')) {
    // Speed clone → says yes to speed content
    if (prompt.includes('5K') || prompt.includes('interval') || prompt.includes('sprint')) {
      return 'yes';
    }
    return 'no';
  }

  return 'no';
}

// ─── Test ───────────────────────────────────────────────────────────────────

async function run() {
  console.log('=== Marble Investigative Integration Test ===\n');

  // 1. Seed user facts
  const kg = new KnowledgeGraph('/tmp/marble-test-kg.json');
  await kg.load(); // initialises defaultUser if no file exists
  kg.addBelief('age', '37', 0.99);
  kg.addBelief('location', 'Barcelona', 0.99);
  kg.addBelief('activity', 'running', 0.9);
  kg.addBelief('health_protocol', 'TRT', 0.9);
  console.log('✓ Seeded user facts');

  // 2. Run CuriosityLoop
  const loop = new CuriosityLoop(kg, stubLLM, { maxRounds: 3 });

  // No external data sources → all questions become gaps
  const result = await loop.startCuriosityLoop();
  console.log(`✓ Investigation complete — answered: ${result.answered}, gaps: ${result.gaps.length}, rounds: ${result.rounds}`);

  // 3. Gaps should exist and be non-trivial
  assert.ok(result.gaps.length >= 1, 'Should have found at least 1 knowledge gap');
  for (const gap of result.gaps) {
    assert.ok(gap.length > 10, `Gap "${gap}" is too short — probably trivial`);
    // No predefined options in any gap question
    const predefinedMarkers = ['A)', 'B)', 'C)', '1.', '2.', '3.', 'options:', 'choose:'];
    for (const marker of predefinedMarkers) {
      assert.ok(!gap.includes(marker), `Gap "${gap}" contains predefined option marker: "${marker}"`);
    }
  }
  console.log(`✓ All ${result.gaps.length} gaps are non-trivial and free of predefined options`);

  // 4. Seed clones from gaps
  const fakeClient = {
    messages: {
      create: async ({ messages }) => {
        const content = await stubLLM(messages[messages.length - 1].content);
        return { content: [{ type: 'text', text: content }] };
      }
    }
  };

  const clones = await kg.seedClones(fakeClient, 'stub');
  assert.ok(clones.length >= 2, `Expected at least 2 clones, got ${clones.length}`);

  for (const clone of clones) {
    assert.ok(clone.gap, 'Clone must have a gap field');
    assert.ok(clone.hypothesis, 'Clone must have a hypothesis');
    assert.ok(clone.kgOverrides, 'Clone must have kgOverrides');
    assert.ok(Array.isArray(clone.kgOverrides.beliefs), 'kgOverrides.beliefs must be an array');
    assert.ok(
      clone.kgOverrides.beliefs.length > 0 ||
      clone.kgOverrides.preferences.length > 0 ||
      clone.kgOverrides.identities.length > 0,
      'Clone must have at least one kgOverride'
    );
    kg.saveClone(clone);
  }
  console.log(`✓ Seeded ${clones.length} archetype clones — each has gap + kgOverrides`);

  // 5. Simulate reactions — endurance-oriented content
  //    Endurance clone should predict correctly; speed clone should not.
  const enduranceItems = [
    { item: { title: 'Training for your first marathon', domain: 'article', tags: ['running', 'marathon'] }, reaction: 'up' },
    { item: { title: 'Ultra trail running — a beginner guide', domain: 'article', tags: ['trail', 'ultra'] }, reaction: 'up' },
    { item: { title: 'How to build aerobic base', domain: 'article', tags: ['marathon', 'endurance'] }, reaction: 'up' },
    { item: { title: 'Sprint interval HIIT for 5K runners', domain: 'article', tags: ['5K', 'interval'] }, reaction: 'down' },
    { item: { title: 'Speed work for competitive runners', domain: 'article', tags: ['sprint', 'speed'] }, reaction: 'down' },
    { item: { title: '100-mile week: endurance block overview', domain: 'article', tags: ['ultra', 'marathon'] }, reaction: 'up' },
    { item: { title: '5K race strategy', domain: 'article', tags: ['5K', 'sprint'] }, reaction: 'down' },
    { item: { title: 'Trail shoes for mountain ultras', domain: 'article', tags: ['trail', 'ultra'] }, reaction: 'up' },
    { item: { title: 'Interval training for speed gains', domain: 'article', tags: ['interval', 'speed'] }, reaction: 'down' },
    { item: { title: 'Zone 2 training for fat adaptation', domain: 'article', tags: ['marathon', 'endurance'] }, reaction: 'up' },
  ];

  const population = new ClonePopulation(kg, stubLLM);
  const evoResult = await population.evolve(enduranceItems);
  console.log(`✓ Evolution run — killed: ${evoResult.killed}, active: ${evoResult.active}`);

  // 6. Verify convergence
  const activeClones = kg.getActiveClones();
  const best = population.getBestClone();
  assert.ok(best, 'Should have a best clone');
  assert.ok(best.confidence > 0.5, `Best clone confidence ${best.confidence.toFixed(2)} should be > 0.5`);
  assert.ok(best.hypothesis.toLowerCase().includes('endurance'),
    `Best clone should be the endurance hypothesis, got: "${best.hypothesis}"`);

  // Speed clone should have lower confidence than endurance clone
  const enduranceClone = activeClones.find(c => c.hypothesis.toLowerCase().includes('endurance'));
  const speedClone = kg.user.clones?.find(c => c.hypothesis.toLowerCase().includes('speed'));

  if (enduranceClone && speedClone) {
    assert.ok(
      enduranceClone.confidence > speedClone.confidence,
      `Endurance clone (${enduranceClone.confidence.toFixed(2)}) should outperform speed clone (${speedClone.confidence.toFixed(2)})`
    );
    console.log(`✓ Endurance clone (${enduranceClone.confidence.toFixed(2)}) > Speed clone (${speedClone.confidence.toFixed(2)})`);
  }

  console.log(`\n✅ All assertions passed. Best clone: "${best.hypothesis}" (confidence: ${best.confidence.toFixed(2)})`);
}

run().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
