/**
 * Test SignalProcessor — Implicit Signal Processing
 */

import { SignalProcessor } from '../core/signals.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
  console.log(`✅ ${message}`);
}

function testSignalRecording() {
  console.log('\n🧪 Testing signal recording...');

  const processor = new SignalProcessor();

  // Test recording different signal types
  processor.recordSignal('story1', 'dwell', 25000);
  processor.recordSignal('story1', 'click', 1);
  processor.recordSignal('story2', 'scroll', { depth: 0.9 });
  processor.recordSignal('story3', 'forward', 1);

  assert(processor.getSignalCount() === 3, 'Should track 3 stories');

  const story1Signals = processor.signals.get('story1');
  assert(story1Signals.length === 2, 'Story1 should have 2 signals');
  assert(story1Signals[0].type === 'dwell', 'First signal should be dwell');
  assert(story1Signals[1].type === 'click', 'Second signal should be click');
}

function testExplicitSignalInference() {
  console.log('\n🧪 Testing explicit signal inference...');

  const processor = new SignalProcessor();

  // Test strong positive signals
  processor.recordSignal('story1', 'dwell', 35000); // Long dwell
  processor.recordSignal('story1', 'click', 1);
  processor.recordSignal('story1', 'scroll', { depth: 0.9 });

  // Test share signal
  processor.recordSignal('story2', 'forward', 1);
  processor.recordSignal('story2', 'dwell', 20000);

  // Test negative signal (quick exit)
  processor.recordSignal('story3', 'dwell', 2000); // Very quick

  const reactions = processor.inferReactions();

  // Find specific reactions
  const story1Reaction = reactions.find(r => r.storyId === 'story1');
  const story2Reaction = reactions.find(r => r.storyId === 'story2');
  const story3Reaction = reactions.find(r => r.storyId === 'story3');

  assert(story1Reaction && story1Reaction.reaction === 'up', 'Story1 should be up reaction');
  assert(story2Reaction && story2Reaction.reaction === 'share', 'Story2 should be share reaction');
  assert(story3Reaction && story3Reaction.reaction === 'down', 'Story3 should be down reaction');

  assert(story1Reaction.confidence > 0.6, 'Story1 should have high confidence');
  assert(story2Reaction.confidence >= 0.8, 'Story2 share should have very high confidence');
}

function testSilenceDetection() {
  console.log('\n🧪 Testing silence detection...');

  const processor = new SignalProcessor();

  // Create 10 stories, with 7 having signals (70% engagement)
  for (let i = 1; i <= 7; i++) {
    processor.recordSignal(`story${i}`, 'dwell', 15000);
    processor.recordSignal(`story${i}`, 'scroll', { depth: 0.5 });
  }

  // Stories 8, 9, 10 have no signals (silence)
  // Need to ensure they're in the signal map structure
  const allStoryIds = Array.from(Array(10), (_, i) => `story${i + 1}`);

  // Simulate the silence detection by creating empty signal arrays for silent stories
  processor.signals.set('story8', []);
  processor.signals.set('story9', []);
  processor.signals.set('story10', []);

  const reactions = processor.inferReactions();

  const silenceReactions = reactions.filter(r => r.source === 'silence_detection');
  assert(silenceReactions.length === 3, 'Should detect 3 silent stories as down reactions');

  const silentStoryIds = silenceReactions.map(r => r.storyId).sort();
  assert(
    JSON.stringify(silentStoryIds) === JSON.stringify(['story10', 'story8', 'story9']),
    'Should identify correct silent stories'
  );

  assert(
    silenceReactions.every(r => r.reaction === 'down'),
    'All silence reactions should be down'
  );
}

function testProcessorUtilities() {
  console.log('\n🧪 Testing processor utilities...');

  const processor = new SignalProcessor();

  processor.recordSignal('story1', 'dwell', 15000);
  processor.recordSignal('story2', 'click', 1);

  assert(processor.getSignalCount() === 2, 'Should report correct signal count');

  processor.clearSignals();
  assert(processor.getSignalCount() === 0, 'Should clear all signals');
  assert(processor.signals.size === 0, 'Signal map should be empty');
}

function runAllTests() {
  console.log('🎯 Running SignalProcessor Tests\n');

  try {
    testSignalRecording();
    testExplicitSignalInference();
    testSilenceDetection();
    testProcessorUtilities();

    console.log('\n🎉 All tests passed! SignalProcessor is working correctly.');
    return true;
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    return false;
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests };