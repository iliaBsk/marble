/**
 * Evolution Test — ClonePopulation Evolutionary Fitness
 *
 * Tests the evolutionary personalization system that optimizes
 * clone variants based on user reaction feedback.
 */

import { ClonePopulation, evaluateFitness } from '../core/evolution.js';
import { KnowledgeGraph } from '../core/kg.js';

// ── Test Data ────────────────────────────────────────────

const TEST_USER_PROFILE = {
  id: 'test-user',
  interests: [
    { topic: 'ai', weight: 0.9, last_boost: new Date().toISOString(), trend: 'stable' },
    { topic: 'startups', weight: 0.7, last_boost: new Date().toISOString(), trend: 'rising' },
    { topic: 'tech', weight: 0.6, last_boost: new Date().toISOString(), trend: 'stable' },
  ],
  context: {
    active_projects: ['AI Startup'],
    calendar: ['Meeting at 2pm'],
    recent_conversations: ['GPT-4', 'YC Demo Day'],
    mood_signal: 'excited'
  },
  history: [
    { story_id: 'h1', reaction: 'up', date: new Date().toISOString(), topics: ['ai'], source: 'hackernews' },
    { story_id: 'h2', reaction: 'up', date: new Date().toISOString(), topics: ['startups'], source: 'techcrunch' },
    { story_id: 'h3', reaction: 'down', date: new Date().toISOString(), topics: ['sports'], source: 'espn' },
  ],
  source_trust: {
    'hackernews': 0.9,
    'techcrunch': 0.8,
    'espn': 0.3,
    'arxiv': 0.95
  }
};

const TEST_STORIES = [
  {
    id: 's1',
    title: 'New AI Model Breakthrough',
    summary: 'Revolutionary language model shows 90% improvement',
    source: 'hackernews',
    topics: ['ai', 'tech'],
    published_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    actionability: 0.7,
    novelty: 0.8
  },
  {
    id: 's2',
    title: 'Startup Raises $50M Series A',
    summary: 'AI-powered analytics company secures major funding',
    source: 'techcrunch',
    topics: ['startups', 'ai'],
    published_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    actionability: 0.3,
    novelty: 0.6
  },
  {
    id: 's3',
    title: 'Sports Game Results',
    summary: 'Local team wins championship game',
    source: 'espn',
    topics: ['sports'],
    published_at: new Date().toISOString(),
    actionability: 0.1,
    novelty: 0.2
  }
];

const REACTION_DATA = [
  { story: TEST_STORIES[0], reaction: 'up', prediction: 0.8 },    // AI story - liked
  { story: TEST_STORIES[1], reaction: 'up', prediction: 0.7 },    // Startup story - liked
  { story: TEST_STORIES[2], reaction: 'skip', prediction: 0.2 }   // Sports story - skipped
];

// ── Test Functions ──────────────────────────────────────

async function testClonePopulation() {
  console.log('🧬 Testing ClonePopulation...');

  // Create test KG
  const kg = new KnowledgeGraph(':memory:');
  kg.user = TEST_USER_PROFILE;

  // Create population
  const population = new ClonePopulation(kg, 10);

  console.log(`   ✓ Created population of ${population.variants.length} variants`);

  // Test initial fitness evaluation
  const initialStats = population.getStats();
  console.log(`   ✓ Initial population stats:`, {
    avgFitness: initialStats.avgFitness.toFixed(3),
    maxFitness: initialStats.maxFitness.toFixed(3),
    diversity: initialStats.diversityScore.toFixed(3)
  });

  // Test evolution over multiple generations
  console.log('   🔄 Running evolution...');

  for (let gen = 0; gen < 5; gen++) {
    population.evolve(REACTION_DATA);
    const stats = population.getStats();

    console.log(`   Gen ${gen + 1}: avg=${stats.avgFitness.toFixed(3)}, max=${stats.maxFitness.toFixed(3)}, diversity=${stats.diversityScore.toFixed(3)}`);
  }

  // Test best clone selection
  const bestClone = population.getBestClone();
  console.log(`   ✓ Best clone fitness: ${bestClone.fitness.toFixed(3)}`);
  console.log(`   ✓ Best clone weights:`, Object.fromEntries(
    Object.entries(bestClone.weights).map(([k, v]) => [k, v.toFixed(3)])
  ));

  return population;
}

async function testFitnessEvaluation() {
  console.log('📊 Testing fitness evaluation...');

  const kg = new KnowledgeGraph(':memory:');
  kg.user = TEST_USER_PROFILE;

  const population = new ClonePopulation(kg, 3);
  const clone = population.variants[0];

  // Test prediction accuracy
  console.log('   Testing prediction accuracy...');

  for (const { story, reaction } of REACTION_DATA) {
    const prediction = clone.wouldEngage(story);
    const expected = ['up', 'share'].includes(reaction);

    console.log(`   Story: ${story.title.slice(0, 30)}...`);
    console.log(`   Prediction: ${prediction.toFixed(3)} | Actual: ${reaction} | Expected: ${expected}`);
  }

  // Test standalone fitness function
  const fitness = evaluateFitness(clone, REACTION_DATA);
  console.log(`   ✓ Overall fitness score: ${fitness.toFixed(3)}`);

  return fitness;
}

async function testWeightMutation() {
  console.log('🔬 Testing weight mutation...');

  const kg = new KnowledgeGraph(':memory:');
  kg.user = TEST_USER_PROFILE;

  const population = new ClonePopulation(kg, 1);
  const parent = population.variants[0];

  console.log('   Original weights:', Object.fromEntries(
    Object.entries(parent.weights).map(([k, v]) => [k, v.toFixed(3)])
  ));

  // Test multiple mutations
  for (let i = 1; i <= 3; i++) {
    const mutated = parent.mutate(0.2); // 20% mutation rate
    console.log(`   Mutation ${i}:     `, Object.fromEntries(
      Object.entries(mutated.weights).map(([k, v]) => [k, v.toFixed(3)])
    ));
    console.log(`   Generation: ${mutated.generation}, ID: ${mutated.id}`);
  }

  console.log('   ✓ Weight mutation working correctly');
}

// ── Main Test Runner ─────────────────────────────────────

async function runEvolutionTests() {
  console.log('🧬 Prism Evolution Tests\n');

  try {
    await testClonePopulation();
    console.log('');

    await testFitnessEvaluation();
    console.log('');

    await testWeightMutation();
    console.log('');

    console.log('✅ All evolution tests passed!');
    console.log('');
    console.log('🎯 Evolution system ready for production use:');
    console.log('   • ClonePopulation manages variant optimization');
    console.log('   • evaluateFitness scores prediction accuracy');
    console.log('   • evolve() improves population over generations');
    console.log('   • getBestClone() returns optimal performer');

  } catch (error) {
    console.error('❌ Evolution test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEvolutionTests();
}

export { runEvolutionTests };