/**
 * Prism Knowledge Graph
 *
 * User-centric graph where the user is the root node.
 * Stories are scored by their distance to what matters to the user right now.
 */

import { readFile, writeFile } from 'fs/promises';

export class KnowledgeGraph {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.user = null;
    this.stories = new Map();
  }

  async load() {
    try {
      const raw = await readFile(this.dataPath, 'utf-8');
      const data = JSON.parse(raw);
      this.user = data.user;
      return this;
    } catch {
      this.user = this.#defaultUser();
      return this;
    }
  }

  async save() {
    const data = { user: this.user, updated_at: new Date().toISOString() };
    await writeFile(this.dataPath, JSON.stringify(data, null, 2));
  }

  /**
   * Get interest weight for a topic. Returns 0 if no interest registered.
   */
  getInterestWeight(topic) {
    const interest = this.user.interests.find(i =>
      i.topic.toLowerCase() === topic.toLowerCase()
    );
    if (!interest) return 0;
    return this.#applyDecay(interest);
  }

  /**
   * Boost interest weight based on positive reaction
   */
  boostInterest(topic, amount = 0.1) {
    let interest = this.user.interests.find(i =>
      i.topic.toLowerCase() === topic.toLowerCase()
    );
    if (!interest) {
      interest = { topic, weight: 0, last_boost: new Date().toISOString(), trend: 'rising' };
      this.user.interests.push(interest);
    }
    interest.weight = Math.min(1, interest.weight + amount);
    interest.last_boost = new Date().toISOString();
    interest.trend = 'rising';
  }

  /**
   * Decay interest weight based on negative reaction
   */
  decayInterest(topic, amount = 0.05) {
    const interest = this.user.interests.find(i =>
      i.topic.toLowerCase() === topic.toLowerCase()
    );
    if (!interest) return;
    interest.weight = Math.max(0, interest.weight - amount);
    interest.trend = 'falling';
  }

  /**
   * Record a reaction and update interest weights
   */
  recordReaction(storyId, reaction, topics, source) {
    this.user.history.push({
      story_id: storyId,
      reaction,
      date: new Date().toISOString(),
      topics,
      source
    });

    // Update interest weights based on reaction
    for (const topic of topics) {
      if (reaction === 'up' || reaction === 'share') {
        this.boostInterest(topic, reaction === 'share' ? 0.15 : 0.1);
      } else if (reaction === 'down') {
        this.decayInterest(topic, 0.05);
      }
    }

    // Update source trust
    this.#updateSourceTrust(source, reaction);

    // Trim history to last 500 entries
    if (this.user.history.length > 500) {
      this.user.history = this.user.history.slice(-500);
    }
  }

  /**
   * Set today's ephemeral context
   */
  setContext(context) {
    this.user.context = { ...this.user.context, ...context };
  }

  /**
   * Get source trust score (0-1)
   */
  getSourceTrust(source) {
    return this.user.source_trust[source] ?? 0.5; // neutral default
  }

  /**
   * Check if user has seen a story recently
   */
  hasSeen(storyId) {
    return this.user.history.some(h => h.story_id === storyId);
  }

  // ── Private ──────────────────────────────────────────

  #applyDecay(interest) {
    const daysSinceBoost = (Date.now() - new Date(interest.last_boost).getTime()) / 86400000;
    const halfLife = 14; // 2 weeks half-life
    const decayFactor = Math.pow(0.5, daysSinceBoost / halfLife);
    return interest.weight * decayFactor;
  }

  #updateSourceTrust(source, reaction) {
    const current = this.user.source_trust[source] ?? 0.5;
    if (reaction === 'up' || reaction === 'share') {
      this.user.source_trust[source] = Math.min(1, current + 0.02);
    } else if (reaction === 'down') {
      this.user.source_trust[source] = Math.max(0, current - 0.03);
    }
  }

  #defaultUser() {
    return {
      id: 'default',
      interests: [],
      context: {
        calendar: [],
        active_projects: [],
        recent_conversations: [],
        mood_signal: null
      },
      history: [],
      source_trust: {}
    };
  }
}
