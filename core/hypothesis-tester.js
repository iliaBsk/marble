/**
 * hypothesis-tester.js — Marble Hypothesis Testing Engine
 *
 * Tests KG hypotheses by generating content test criteria, serving
 * specific content, and observing user reactions. Uses Bayesian
 * confidence updates to strengthen or weaken hypotheses.
 *
 * FLOW:
 * 1. KG has hypothesis: "user values stability, avoids uncertainty"
 * 2. System generates a test: serve a story about spontaneous travel
 * 3. If user ignores/downvotes → hypothesis confidence increases
 * 4. If user engages → hypothesis weakened, contradicting signal added
 * 5. Updated confidence propagates to derived predictions
 */

import { MarbleKG } from './kg.js';
import { InsightEngine } from './insight-engine.js';

// ─── TEST CONTENT TEMPLATES ─────────────────────────────────────────────
// Maps hypothesis keywords to content that would CHALLENGE the hypothesis.
// If hypothesis says user avoids X, we serve X to test.

const CHALLENGE_TEMPLATES = [
  {
    keywords: ['stability', 'routine', 'predictable', 'avoids uncertainty', 'avoids risk'],
    challenge_topics: ['spontaneous travel', 'adventure', 'impulsive decisions', 'risk-taking', 'radical change'],
    confirm_topics: ['routine', 'planning', 'stability', 'predictability', 'long-term investment'],
    label: 'stability_vs_spontaneity',
  },
  {
    keywords: ['protector', 'family', 'parenting', 'kid', 'children'],
    challenge_topics: ['solo adventure', 'nightlife', 'extreme sports', 'carefree lifestyle'],
    confirm_topics: ['family activity', 'child safety', 'parenting tips', 'home improvement'],
    label: 'protector_vs_adventurer',
  },
  {
    keywords: ['introvert', 'solitary', 'avoids social', 'quiet'],
    challenge_topics: ['networking events', 'party', 'group activities', 'public speaking'],
    confirm_topics: ['solo hobbies', 'reading', 'deep work', 'home office'],
    label: 'introvert_vs_social',
  },
  {
    keywords: ['health', 'fitness', 'diet', 'discipline', 'optimizing'],
    challenge_topics: ['indulgence', 'junk food celebration', 'lazy day', 'cheat meals'],
    confirm_topics: ['meal prep', 'workout routine', 'supplement guide', 'sleep optimization'],
    label: 'discipline_vs_indulgence',
  },
  {
    keywords: ['builder', 'maker', 'shipping', 'creating', 'startup'],
    challenge_topics: ['passive income', 'retirement', 'consumption', 'leisure', 'spectating'],
    confirm_topics: ['build in public', 'launch strategy', 'product development', 'maker tools'],
    label: 'builder_vs_consumer',
  },
  {
    keywords: ['frugal', 'saving', 'budget', 'financial anxiety', 'debt'],
    challenge_topics: ['luxury goods', 'splurge', 'premium lifestyle', 'expensive travel'],
    confirm_topics: ['budgeting tips', 'savings strategy', 'frugal living', 'debt payoff'],
    label: 'frugal_vs_luxury',
  },
  {
    keywords: ['career', 'transition', 'pivot', 'new direction'],
    challenge_topics: ['staying put', 'corporate loyalty', 'promotion ladder', 'comfort zone'],
    confirm_topics: ['career pivot stories', 'freelance playbook', 'side project launch'],
    label: 'transition_vs_stability',
  },
];

// ─── BAYESIAN CONFIDENCE UPDATE ─────────────────────────────────────────

/**
 * Bayesian update for hypothesis confidence.
 *
 * @param {number} prior - current confidence (0-1)
 * @param {string} outcome - 'confirmed' | 'denied' | 'inconclusive'
 * @param {object} [opts]
 * @param {number} [opts.likelihoodIfTrue=0.8] - P(outcome | hypothesis true)
 * @param {number} [opts.likelihoodIfFalse=0.3] - P(outcome | hypothesis false)
 * @returns {number} posterior confidence (0.05 - 0.95)
 */
function bayesianUpdate(prior, outcome, opts = {}) {
  if (outcome === 'inconclusive') {
    // Slight decay toward uncertainty
    return Math.max(0.05, Math.min(0.95, prior * 0.98));
  }

  const ltTrue = opts.likelihoodIfTrue || 0.8;
  const ltFalse = opts.likelihoodIfFalse || 0.3;

  if (outcome === 'confirmed') {
    // P(H|E) = P(E|H)*P(H) / [P(E|H)*P(H) + P(E|¬H)*P(¬H)]
    const numerator = ltTrue * prior;
    const denominator = numerator + ltFalse * (1 - prior);
    return Math.max(0.05, Math.min(0.95, Math.round((numerator / denominator) * 100) / 100));
  }

  if (outcome === 'denied') {
    // P(H|¬E) = P(¬E|H)*P(H) / [P(¬E|H)*P(H) + P(¬E|¬H)*P(¬H)]
    const pNotEGivenH = 1 - ltTrue;
    const pNotEGivenNotH = 1 - ltFalse;
    const numerator = pNotEGivenH * prior;
    const denominator = numerator + pNotEGivenNotH * (1 - prior);
    return Math.max(0.05, Math.min(0.95, Math.round((numerator / denominator) * 100) / 100));
  }

  return prior;
}

// ─── MAIN CLASS ─────────────────────────────────────────────────────────

export class HypothesisTester {
  /**
   * @param {MarbleKG} kg - loaded MarbleKG instance
   * @param {object} [opts]
   * @param {boolean} [opts.autoSave=false] - persist KG after each test result
   * @param {number} [opts.maxActiveTests=5] - max concurrent hypothesis tests
   * @param {number} [opts.minConfidenceToTest=0.25] - only test hypotheses above this
   */
  constructor(kg, opts = {}) {
    this.kg = kg;
    this.engine = new InsightEngine(kg);
    this.autoSave = opts.autoSave || false;
    this.maxActiveTests = opts.maxActiveTests || 5;
    this.minConfidenceToTest = opts.minConfidenceToTest || 0.25;
    this.activeTests = []; // in-memory tracker of pending tests
  }

  /**
   * Select hypotheses from KG that are worth testing.
   * Prioritizes: high confidence (worth validating) and untested hypotheses.
   *
   * @param {object} [opts]
   * @param {number} [opts.limit] - max hypotheses to return
   * @returns {object[]} - insight objects worth testing
   */
  selectTestableHypotheses(opts = {}) {
    const limit = opts.limit || this.maxActiveTests;
    const insights = this.kg.getInsights({ minConfidence: this.minConfidenceToTest });

    // Score each insight for testability
    const scored = insights.map(insight => {
      const testCount = (insight.test_results || []).length;
      const hasTemplate = this._findTemplate(insight.hypothesis) !== null;

      // Prioritize: has template, fewer prior tests, moderate-to-high confidence
      let priority = 0;
      if (hasTemplate) priority += 3;
      if (testCount === 0) priority += 2;
      else if (testCount < 3) priority += 1;
      // Sweet spot: confident enough to matter, uncertain enough to test
      if (insight.confidence >= 0.4 && insight.confidence <= 0.8) priority += 2;

      return { insight, priority, testCount, hasTemplate };
    });

    return scored
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit)
      .map(s => s.insight);
  }

  /**
   * Generate a content test for a specific hypothesis.
   * Returns test criteria that the content system should use to select/generate
   * a piece of content that challenges or confirms the hypothesis.
   *
   * @param {string} insightId - ID of the insight/hypothesis to test
   * @returns {object|null} - test specification, or null if no test can be generated
   */
  generateTest(insightId) {
    const insight = (this.kg.data.user.insights || []).find(i => i.id === insightId);
    if (!insight) return null;

    const template = this._findTemplate(insight.hypothesis);

    // Build challenge content criteria
    const challengeTopics = template
      ? template.challenge_topics
      : this._inferChallengeTopics(insight);

    const confirmTopics = template
      ? template.confirm_topics
      : (insight.supporting_signals || []).slice(0, 4);

    const testId = `test_${insightId}_${Date.now()}`;

    const test = {
      test_id: testId,
      insight_id: insightId,
      hypothesis: insight.hypothesis,
      confidence_before: insight.confidence,
      label: template ? template.label : 'custom',
      // Content to serve that CHALLENGES the hypothesis
      challenge: {
        topics: challengeTopics,
        description: `Content that contradicts: "${insight.hypothesis}"`,
        expected_reaction: 'ignore_or_downvote',
      },
      // Content to serve that CONFIRMS the hypothesis
      confirm: {
        topics: confirmTopics,
        description: `Content that aligns with: "${insight.hypothesis}"`,
        expected_reaction: 'engage_or_upvote',
      },
      created_at: new Date().toISOString(),
      status: 'pending',
    };

    this.activeTests.push(test);
    return test;
  }

  /**
   * Get content scoring adjustments for active hypothesis tests.
   * Integrates with scorer.js — returns topics to inject into the feed.
   *
   * @returns {object[]} - { topics, boost, reason, test_id }
   */
  getTestInjections() {
    const injections = [];

    for (const test of this.activeTests) {
      if (test.status !== 'pending') continue;

      // Inject challenge content (with slight boost so it appears)
      injections.push({
        topics: test.challenge.topics,
        boost: 0.05, // small boost — enough to appear, not enough to dominate
        reason: `Hypothesis test: challenging "${test.hypothesis}"`,
        test_id: test.test_id,
        test_type: 'challenge',
      });
    }

    return injections;
  }

  /**
   * Record the result of a hypothesis test.
   * Observes user reaction to test content and updates KG confidence.
   *
   * @param {string} testId - the test_id from generateTest()
   * @param {object} reaction - { engaged: boolean, score?: number, reaction?: 'up'|'down'|'ignore' }
   * @returns {object|null} - { insight, outcome, confidence_before, confidence_after, test }
   */
  recordResult(testId, reaction) {
    const test = this.activeTests.find(t => t.test_id === testId);
    if (!test) return null;

    const insight = (this.kg.data.user.insights || []).find(i => i.id === test.insight_id);
    if (!insight) return null;

    // Determine outcome based on reaction to CHALLENGE content
    let outcome;
    if (reaction.reaction === 'ignore' || reaction.reaction === 'down' || (!reaction.engaged && !reaction.score)) {
      // User ignored/downvoted challenge content → hypothesis confirmed
      outcome = 'confirmed';
    } else if (reaction.engaged || reaction.reaction === 'up' || (reaction.score && reaction.score > 0)) {
      // User engaged with challenge content → hypothesis denied
      outcome = 'denied';
    } else {
      outcome = 'inconclusive';
    }

    const confidenceBefore = insight.confidence;

    // Bayesian update
    const posterior = bayesianUpdate(insight.confidence, outcome);
    insight.confidence = posterior;
    insight.updated_at = new Date().toISOString();

    // Record test result in KG
    if (!insight.test_results) insight.test_results = [];
    insight.test_results.push({
      prediction: test.hypothesis,
      outcome,
      date: new Date().toISOString(),
      test_id: testId,
      reaction_detail: reaction,
    });

    // Handle denied hypothesis — add contradicting signal
    if (outcome === 'denied') {
      const contradictingSignal = `challenge_engaged:${test.label}`;
      if (!insight.contradicting_signals) insight.contradicting_signals = [];
      if (!insight.contradicting_signals.includes(contradictingSignal)) {
        insight.contradicting_signals.push(contradictingSignal);
      }
    }

    // Propagate updated confidence to derived/dependent insights
    const propagated = this.propagateConfidence(insight, confidenceBefore);

    // Mark test complete
    test.status = 'completed';
    test.outcome = outcome;
    test.completed_at = new Date().toISOString();

    if (this.autoSave) {
      this.kg.save();
    }

    return {
      insight,
      outcome,
      confidence_before: confidenceBefore,
      confidence_after: posterior,
      propagated_updates: propagated,
      test,
    };
  }

  /**
   * Get all active (pending) tests.
   */
  getActiveTests() {
    return this.activeTests.filter(t => t.status === 'pending');
  }

  /**
   * Get completed test history.
   */
  getCompletedTests() {
    return this.activeTests.filter(t => t.status === 'completed');
  }

  /**
   * Get test stats across all hypotheses.
   */
  getTestStats() {
    const allInsights = this.kg.data.user.insights || [];
    let totalTests = 0;
    let confirmed = 0;
    let denied = 0;
    let inconclusive = 0;

    for (const insight of allInsights) {
      for (const result of (insight.test_results || [])) {
        totalTests++;
        if (result.outcome === 'confirmed') confirmed++;
        else if (result.outcome === 'denied') denied++;
        else inconclusive++;
      }
    }

    return {
      totalTests,
      confirmed,
      denied,
      inconclusive,
      activeTests: this.getActiveTests().length,
      accuracy: totalTests > 0 ? Math.round((confirmed / totalTests) * 100) : 0,
    };
  }

  // ─── CONFIDENCE PROPAGATION ───────────────────────────────────────

  /**
   * Propagate a confidence change from a parent insight to dependent insights.
   * Dependent insights are those that:
   *   1. Have parent_insight_id matching the updated insight
   *   2. Have supporting_signals referencing the parent hypothesis
   *
   * Uses a damping factor so downstream updates are proportional but attenuated.
   *
   * @param {object} updatedInsight - the insight whose confidence just changed
   * @param {number} previousConfidence - confidence before the update
   * @param {number} [dampingFactor=0.5] - how much of the delta propagates (0-1)
   * @returns {object[]} - list of { id, confidence_before, confidence_after }
   */
  propagateConfidence(updatedInsight, previousConfidence, dampingFactor = 0.5) {
    const delta = updatedInsight.confidence - previousConfidence;
    if (Math.abs(delta) < 0.01) return []; // no meaningful change

    const dependents = this._getDependentInsights(updatedInsight.id);
    const updates = [];

    for (const dep of dependents) {
      const before = dep.confidence;
      const adjustment = delta * dampingFactor;
      dep.confidence = Math.max(0.05, Math.min(0.95,
        Math.round((dep.confidence + adjustment) * 100) / 100
      ));
      dep.updated_at = new Date().toISOString();

      if (dep.confidence !== before) {
        updates.push({
          id: dep.id,
          hypothesis: dep.hypothesis,
          confidence_before: before,
          confidence_after: dep.confidence,
          reason: `propagated from ${updatedInsight.id} (delta ${delta > 0 ? '+' : ''}${delta.toFixed(2)} × ${dampingFactor})`,
        });
      }
    }

    return updates;
  }

  /**
   * Find insights that depend on a given parent insight.
   * @param {string} parentId
   * @returns {object[]}
   */
  _getDependentInsights(parentId) {
    const allInsights = this.kg.data.user.insights || [];
    return allInsights.filter(i => {
      if (i.id === parentId) return false;
      // Explicit parent link
      if (i.parent_insight_id === parentId) return true;
      // Supporting signals referencing the parent insight ID
      if ((i.supporting_signals || []).some(s => s.includes(parentId))) return true;
      return false;
    });
  }

  // ─── INTERNAL ─────────────────────────────────────────────────────

  /**
   * Find a matching challenge template for a hypothesis.
   * @private
   */
  _findTemplate(hypothesis) {
    if (!hypothesis) return null;
    const lower = hypothesis.toLowerCase();

    for (const tmpl of CHALLENGE_TEMPLATES) {
      const matches = tmpl.keywords.filter(kw => lower.includes(kw));
      if (matches.length > 0) return tmpl;
    }

    return null;
  }

  /**
   * Infer challenge topics when no template matches.
   * Uses simple inversion heuristic.
   * @private
   */
  _inferChallengeTopics(insight) {
    const topics = insight.supporting_signals || [];
    // Generate "opposite" content by prefixing with contrarian framing
    return topics.slice(0, 3).map(t => `anti-${t}`).concat(['contrarian perspective', 'unexpected take']);
  }
}

export { bayesianUpdate, CHALLENGE_TEMPLATES };
export default HypothesisTester;
