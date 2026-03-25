/**
 * Prism Scorer
 *
 * Computes magic_score for each story against the user's knowledge graph.
 * The temporal_relevance dimension is weighted highest — that's the differentiator.
 */

import { SCORE_WEIGHTS } from './types.js';
import { embeddings } from './embeddings.js';

export class Scorer {
  constructor(kg) {
    this.kg = kg;
  }

  /**
   * Score a batch of stories against the user's KG
   * @param {Story[]} stories - Raw stories to score
   * @returns {Promise<ScoredStory[]>} - Stories with computed scores, sorted descending
   */
  async score(stories) {
    const scored = await Promise.all(stories.map(story => this.#scoreOne(story)));
    return scored.sort((a, b) => b.magic_score - a.magic_score);
  }

  async #scoreOne(story) {
    const interest = await this.#interestMatch(story);
    const temporal = this.#temporalRelevance(story);
    const novelty = this.#noveltyScore(story);
    const action = this.#actionability(story);
    const trust = this.#sourceTrust(story);
    const freshness = this.#freshnessDecay(story);

    const raw = (
      interest * SCORE_WEIGHTS.interest_match +
      temporal * SCORE_WEIGHTS.temporal_relevance +
      novelty * SCORE_WEIGHTS.novelty +
      action * SCORE_WEIGHTS.actionability +
      trust * SCORE_WEIGHTS.source_trust
    );

    const magic_score = raw * freshness;

    return {
      story,
      magic_score,
      interest_match: interest,
      temporal_relevance: temporal,
      novelty,
      actionability: action,
      source_trust: trust,
      arc_position: 0, // set later by arc reranker
      why: this.#explainScore({ interest, temporal, novelty, action, trust })
    };
  }

  /**
   * How well does this story match the user's interest graph?
   * Uses semantic embeddings for better matching (e.g., "EU digital markets act" matches "Shopify compliance")
   */
  async #interestMatch(story) {
    if (!story.topics?.length) return 0.3; // neutral for untagged

    // Get story content for semantic analysis
    const storyText = `${story.title} ${story.summary || ''}`.trim();
    if (!storyText) return 0.3;

    try {
      // Get user interests from knowledge graph
      const userInterests = this.kg.getTopInterests?.() || [];
      if (!userInterests.length) {
        // Fallback to topic-based scoring if no interests available
        const weights = story.topics.map(t => this.kg.getInterestWeight(t));
        if (weights.every(w => w === 0)) return 0.1;
        const max = Math.max(...weights);
        const matchCount = weights.filter(w => w > 0).length;
        const multiBonus = Math.min(0.1, matchCount * 0.03);
        return Math.min(1, max + multiBonus);
      }

      // Use semantic similarity for matching
      const interestTexts = userInterests.map(interest =>
        typeof interest === 'string' ? interest : interest.name || interest.topic
      ).filter(Boolean);

      const bestMatch = await embeddings.findMostSimilar(storyText, interestTexts, 0.2);

      if (bestMatch.similarity > 0) {
        // Convert similarity score (0-1) to interest match score with some boosting
        const semanticScore = Math.min(1, bestMatch.similarity * 1.2);

        // Blend with traditional topic matching if available
        const topicWeights = story.topics.map(t => this.kg.getInterestWeight(t));
        const maxTopicWeight = Math.max(0, ...topicWeights);

        // Use the higher of semantic or topic-based score
        return Math.max(semanticScore, maxTopicWeight * 0.8);
      }

      // Fallback to topic-based matching
      const weights = story.topics.map(t => this.kg.getInterestWeight(t));
      if (weights.every(w => w === 0)) return 0.1;
      const max = Math.max(...weights);
      return max * 0.8; // Slightly lower for non-semantic matches

    } catch (error) {
      console.warn('Semantic matching failed, using fallback:', error.message);
      // Fallback to original keyword-based matching
      const weights = story.topics.map(t => this.kg.getInterestWeight(t));
      if (weights.every(w => w === 0)) return 0.1;
      const max = Math.max(...weights);
      const matchCount = weights.filter(w => w > 0).length;
      const multiBonus = Math.min(0.1, matchCount * 0.03);
      return Math.min(1, max + multiBonus);
    }
  }

  /**
   * How relevant is this story to what's happening in the user's life TODAY?
   * This is the magic dimension — calendar, projects, conversations.
   */
  #temporalRelevance(story) {
    const ctx = this.kg.user.context;
    let score = 0.2; // baseline

    const storyText = `${story.title} ${story.summary}`.toLowerCase();

    // Check against active projects
    for (const project of ctx.active_projects || []) {
      if (storyText.includes(project.toLowerCase())) {
        score += 0.3;
        break;
      }
    }

    // Check against today's calendar
    for (const event of ctx.calendar || []) {
      const eventWords = event.toLowerCase().split(/\s+/);
      if (eventWords.some(w => w.length > 3 && storyText.includes(w))) {
        score += 0.25;
        break;
      }
    }

    // Check against recent conversation topics
    for (const convo of ctx.recent_conversations || []) {
      if (storyText.includes(convo.toLowerCase())) {
        score += 0.15;
        break;
      }
    }

    return Math.min(1, score);
  }

  /**
   * How novel/surprising is this story?
   * Stories the user has already seen or on over-saturated topics score lower.
   */
  #noveltyScore(story) {
    // Already seen = 0
    if (this.kg.hasSeen(story.id)) return 0;

    // Check topic saturation in recent history
    const recentHistory = this.kg.user.history.slice(-50);
    const topicCounts = {};
    for (const h of recentHistory) {
      for (const t of h.topics || []) {
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      }
    }

    // Stories with over-represented topics get novelty penalty
    let saturation = 0;
    for (const topic of story.topics || []) {
      saturation += (topicCounts[topic] || 0);
    }

    const novelty = Math.max(0.1, 1 - (saturation / 20));
    return novelty;
  }

  /**
   * Can the user DO something with this story today?
   */
  #actionability(story) {
    // If story has explicit actionability tag, use it
    if (typeof story.actionability === 'number') return story.actionability;

    // Heuristic: stories mentioning tools, launches, deadlines, opportunities
    const actionWords = ['launch', 'deadline', 'opportunity', 'available', 'release',
      'update', 'new feature', 'apply', 'register', 'open source', 'free'];
    const text = `${story.title} ${story.summary}`.toLowerCase();
    const matches = actionWords.filter(w => text.includes(w)).length;

    return Math.min(1, 0.2 + matches * 0.15);
  }

  /**
   * How much does the user trust this source?
   */
  #sourceTrust(story) {
    return this.kg.getSourceTrust(story.source);
  }

  /**
   * Freshness decay — older stories get penalized
   */
  #freshnessDecay(story) {
    const hoursOld = (Date.now() - new Date(story.published_at).getTime()) / 3600000;
    if (hoursOld < 2) return 1.0;
    if (hoursOld < 6) return 0.95;
    if (hoursOld < 12) return 0.85;
    if (hoursOld < 24) return 0.7;
    if (hoursOld < 48) return 0.5;
    return 0.3;
  }

  /**
   * Generate human-readable explanation for why a story was selected
   */
  #explainScore({ interest, temporal, novelty, action, trust }) {
    const reasons = [];
    if (temporal > 0.5) reasons.push('relevant to your day');
    if (interest > 0.6) reasons.push('matches your interests');
    if (novelty > 0.7) reasons.push('fresh perspective');
    if (action > 0.5) reasons.push('actionable');
    if (trust > 0.7) reasons.push('trusted source');
    return reasons.join(', ') || 'general relevance';
  }
}
