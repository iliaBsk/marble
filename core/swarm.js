/**
 * Prism Swarm — Multi-Agent Story Curation
 *
 * Each agent evaluates stories through a different lens,
 * all grounded in the user's Clone (digital twin).
 *
 * The agents don't just score — they argue, advocate, and reach consensus.
 * This is how 100 stories become 10 magical ones.
 */

import { Clone } from './clone.js';

// ── Agent Definitions ──────────────────────────────────────────

const AGENT_LENSES = {
  career: {
    name: 'Career Agent',
    mandate: 'Find stories that directly impact the user\'s active projects, business, and professional goals. Ask: "Will this help them make money, avoid a mistake, or seize an opportunity in their current work?"',
    weight: 0.25
  },
  growth: {
    name: 'Growth Agent',
    mandate: 'Find stories that expand the user\'s thinking beyond their current bubble. Not random — adjacent interests, emerging fields they should know about, ideas that connect to what they already care about in non-obvious ways.',
    weight: 0.15
  },
  timing: {
    name: 'Timing Agent',
    mandate: 'Find stories where TODAY is the perfect day to hear them. Calendar events, project deadlines, meetings, seasonal relevance, breaking news that affects decisions they\'re making right now.',
    weight: 0.25
  },
  contrarian: {
    name: 'Contrarian Agent',
    mandate: 'Find stories everyone else would miss. Challenge the user\'s assumptions. Surface signal from noise. The story nobody is talking about that will matter in 2 weeks. The take that goes against the grain but is backed by evidence.',
    weight: 0.15
  },
  serendipity: {
    name: 'Serendipity Agent',
    mandate: 'Find stories that would genuinely delight, surprise, or inspire the user. Not clickbait — real moments of "I didn\'t know I needed to hear this today." Human stories, unexpected connections, the kind of thing you\'d screenshot and send to a friend.',
    weight: 0.20
  }
};

// ── Swarm Agent ──────────────────────────────────────────

class SwarmAgent {
  constructor(lens, clone) {
    this.lens = lens;
    this.clone = clone;
    this.picks = [];
  }

  /**
   * Evaluate all stories through this agent's lens.
   * Returns scored picks with reasoning.
   */
  evaluate(stories) {
    this.picks = stories.map(story => ({
      story,
      score: this.#score(story),
      reason: null // filled by LLM in deep mode
    }));

    this.picks.sort((a, b) => b.score - a.score);
    return this.picks;
  }

  /**
   * Get this agent's top N advocacy picks
   */
  advocate(n = 5) {
    return this.picks.slice(0, n);
  }

  /**
   * Generate prompt for LLM-based deep evaluation
   */
  toPrompt(stories) {
    return [
      `You are the ${this.lens.name} in a story curation swarm.`,
      '',
      `YOUR MANDATE: ${this.lens.mandate}`,
      '',
      this.clone.toPrompt(),
      '',
      '## Stories to evaluate',
      '',
      ...stories.map((s, i) =>
        `${i + 1}. [${s.source}] ${s.title}\n   ${s.summary}\n   Topics: ${(s.topics || []).join(', ')}`
      ),
      '',
      'Pick your top 5 stories. For each, explain WHY this user needs to hear this TODAY.',
      'Format: { "picks": [{ "index": N, "score": 0-1, "reason": "..." }] }'
    ].join('\n');
  }

  // ── Heuristic scoring (fast mode, no LLM) ──────────

  #score(story) {
    const engagement = this.clone.wouldEngage(story);

    switch (this.lens.name) {
      case 'Career Agent':
        return this.#careerScore(story, engagement);
      case 'Growth Agent':
        return this.#growthScore(story, engagement);
      case 'Timing Agent':
        return this.#timingScore(story, engagement);
      case 'Contrarian Agent':
        return this.#contrarianScore(story, engagement);
      case 'Serendipity Agent':
        return this.#serendipityScore(story, engagement);
      default:
        return engagement;
    }
  }

  #careerScore(story, base) {
    let score = base;
    const text = `${story.title} ${story.summary}`.toLowerCase();
    const ctx = this.clone._snapshot?.context || {};

    // Direct project mention = strong signal
    for (const project of ctx.projects || []) {
      if (text.includes(project.toLowerCase())) {
        score += 0.4;
        break;
      }
    }

    // Business-relevant keywords
    const bizWords = ['revenue', 'funding', 'launch', 'acquisition', 'api', 'pricing',
      'competitor', 'market', 'growth', 'customer', 'saas', 'shopify', 'stripe'];
    const bizHits = bizWords.filter(w => text.includes(w)).length;
    score += Math.min(0.2, bizHits * 0.05);

    return Math.min(1, score);
  }

  #growthScore(story, base) {
    let score = base * 0.5; // de-weight pure interest match
    const interests = this.clone._snapshot?.interests || {};

    // Adjacent topics score higher than direct matches
    const directMatch = (story.topics || []).some(t => interests[t]?.weight > 0.5);
    const adjacentMatch = (story.topics || []).some(t => {
      const w = interests[t]?.weight;
      return w && w > 0.1 && w < 0.5; // known but not saturated
    });

    if (adjacentMatch && !directMatch) score += 0.3; // adjacent = growth
    if (!directMatch && !adjacentMatch) score += 0.15; // unknown = potential stretch

    return Math.min(1, score);
  }

  #timingScore(story, base) {
    let score = 0.1;
    const text = `${story.title} ${story.summary}`.toLowerCase();
    const ctx = this.clone._snapshot?.context || {};

    // Calendar match = highest signal
    for (const event of ctx.calendar || []) {
      const words = event.toLowerCase().split(/\s+/);
      if (words.some(w => w.length > 3 && text.includes(w))) {
        score += 0.4;
        break;
      }
    }

    // Recent conversation match
    for (const convo of ctx.conversations || []) {
      if (text.includes(convo.toLowerCase())) {
        score += 0.25;
        break;
      }
    }

    // Freshness matters more for timing
    const hoursOld = story.freshness || 24;
    if (hoursOld < 3) score += 0.2;
    else if (hoursOld < 6) score += 0.1;

    return Math.min(1, score);
  }

  #contrarianScore(story, base) {
    let score = 0.2;
    const patterns = this.clone._snapshot?.patterns || {};

    // Stories on topics the user usually avoids but from trusted sources
    const isAvoided = (story.topics || []).some(t =>
      (patterns.avoids || []).includes(t)
    );
    const isTrusted = (this.clone._snapshot?.source_trust?.[story.source] ?? 0.5) > 0.6;

    if (isAvoided && isTrusted) score += 0.4; // contrarian gold
    if (story.valence === 'alarming') score += 0.1;

    // Low saturation = less covered = contrarian
    const interests = this.clone._snapshot?.interests || {};
    const isMainstream = (story.topics || []).some(t => interests[t]?.weight > 0.7);
    if (!isMainstream) score += 0.15;

    return Math.min(1, score);
  }

  #serendipityScore(story, base) {
    let score = 0.15;

    if (story.valence === 'fun') score += 0.25;
    if (story.valence === 'inspiring') score += 0.2;

    // Moderate interest match = sweet spot (not boring, not irrelevant)
    const interests = this.clone._snapshot?.interests || {};
    const matchStrength = Math.max(
      ...(story.topics || []).map(t => interests[t]?.weight || 0),
      0
    );
    if (matchStrength > 0.2 && matchStrength < 0.6) score += 0.2;

    // Shareable stories score high
    const shareWords = ['beautiful', 'amazing', 'unexpected', 'first ever',
      'discovered', 'breakthrough', 'heartwarming', 'incredible'];
    const text = `${story.title} ${story.summary}`.toLowerCase();
    const shareHits = shareWords.filter(w => text.includes(w)).length;
    score += Math.min(0.2, shareHits * 0.1);

    return Math.min(1, score);
  }
}

// ── Swarm Orchestrator ──────────────────────────────────────

export class Swarm {
  constructor(kg, options = {}) {
    this.clone = new Clone(kg);
    this.agents = [];
    this.options = {
      mode: options.mode || 'fast', // 'fast' (heuristic) or 'deep' (LLM)
      llm: options.llm || null,     // LLM function for deep mode
      topN: options.topN || 10
    };
  }

  /**
   * Run the swarm curation process.
   * Each agent evaluates independently, then consensus is reached.
   *
   * @param {Story[]} stories - All candidate stories (~100)
   * @returns {ScoredStory[]} - Final curated selection
   */
  async curate(stories) {
    // Step 1: Create digital twin snapshot
    this.clone.takeSnapshot();

    // Step 2: Spawn agents with different lenses
    this.agents = Object.entries(AGENT_LENSES).map(([key, lens]) =>
      new SwarmAgent(lens, this.clone)
    );

    // Step 3: Each agent evaluates independently
    if (this.options.mode === 'deep' && this.options.llm) {
      await this.#deepEvaluation(stories);
    } else {
      this.#fastEvaluation(stories);
    }

    // Step 4: Consensus — weighted vote across all agents
    const consensus = this.#buildConsensus(stories);

    // Step 5: Return top N with arc positions
    return consensus.slice(0, this.options.topN);
  }

  /**
   * Fast mode: heuristic scoring, no LLM calls
   */
  #fastEvaluation(stories) {
    for (const agent of this.agents) {
      agent.evaluate(stories);
    }
  }

  /**
   * Deep mode: LLM-powered evaluation per agent
   */
  async #deepEvaluation(stories) {
    const promises = this.agents.map(async (agent) => {
      const prompt = agent.toPrompt(stories);
      const response = await this.options.llm(prompt);

      try {
        const parsed = JSON.parse(response);
        for (const pick of parsed.picks || []) {
          const story = stories[pick.index - 1];
          if (story) {
            agent.picks.push({
              story,
              score: pick.score,
              reason: pick.reason
            });
          }
        }
      } catch {
        // Fallback to heuristic if LLM parsing fails
        agent.evaluate(stories);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Consensus: combine agent picks with weighted voting
   */
  #buildConsensus(stories) {
    const storyScores = new Map();
    const lensKeys = Object.keys(AGENT_LENSES);

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const lens = AGENT_LENSES[lensKeys[i]];
      const topPicks = agent.advocate(15); // each agent's top 15

      for (const pick of topPicks) {
        const id = pick.story.id;
        if (!storyScores.has(id)) {
          storyScores.set(id, {
            story: pick.story,
            total_score: 0,
            agent_scores: {},
            reasons: []
          });
        }

        const entry = storyScores.get(id);
        entry.total_score += pick.score * lens.weight;
        entry.agent_scores[lens.name] = pick.score;
        if (pick.reason) entry.reasons.push(`${lens.name}: ${pick.reason}`);
      }
    }

    // Sort by consensus score
    const ranked = [...storyScores.values()]
      .sort((a, b) => b.total_score - a.total_score);

    // Format as ScoredStory
    return ranked.map((entry, i) => ({
      story: entry.story,
      magic_score: entry.total_score,
      agent_scores: entry.agent_scores,
      why: entry.reasons.length ? entry.reasons.join(' | ') : this.#generateWhy(entry),
      arc_position: i + 1
    }));
  }

  #generateWhy(entry) {
    const top = Object.entries(entry.agent_scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([agent, score]) => `${agent.replace(' Agent', '')}: ${(score * 100).toFixed(0)}%`);
    return top.join(', ');
  }
}

export { Clone, SwarmAgent, AGENT_LENSES };
