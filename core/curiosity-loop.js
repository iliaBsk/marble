/**
 * curiosity-loop.js — Active investigation engine.
 *
 * Wraps InvestigativeCommittee to drive the KG investigation loop.
 * Questions are LLM-generated and must pass an understanding gate.
 * No templates. No predefined options. No fallbacks.
 *
 * Data sources are registered here and passed into InvestigativeCommittee.
 */

import { InvestigativeCommittee } from './investigative-committee.js';

export class CuriosityLoop {
  /**
   * @param {Object} kg          - KnowledgeGraph instance
   * @param {Function} llmCall   - async (prompt: string) => string
   * @param {Object} [opts]
   * @param {number} [opts.maxRounds=5]
   * @param {number} [opts.maxQuestionsPerRound=6]
   */
  constructor(kg, llmCall, opts = {}) {
    this.kg = kg;
    this.committee = new InvestigativeCommittee(kg, llmCall, opts);
  }

  /**
   * Register a data source for the committee to search.
   * @param {string} name
   * @param {Function} searchFn - async (query: string) => string[]
   */
  registerDataSource(name, searchFn) {
    this.committee.registerSource(name, searchFn);
  }

  /**
   * Run the full investigation loop.
   * Findings are stored in KG. Unanswered questions become gap nodes.
   *
   * @param {number} [maxRounds]
   * @returns {Promise<{ answered: number, gaps: string[], rounds: number }>}
   */
  async startCuriosityLoop(maxRounds) {
    const result = await this.committee.investigate(maxRounds);

    // Store gaps as explicit KG nodes so the clone spawner can read them
    for (const gap of result.gaps) {
      this.kg.addBelief(
        `gap:${this._slugify(gap)}`,
        gap,
        0.0 // zero confidence = unresolved gap
      );
    }

    return result;
  }

  /**
   * Return unresolved knowledge gaps from the last run.
   * @returns {string[]}
   */
  getKnowledgeGaps() {
    return this.committee.getKnowledgeGaps();
  }

  /**
   * Return all answered questions from the last run.
   * @returns {Map<string, string>}
   */
  getAnswers() {
    return this.committee.getAnswers();
  }

  _slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
  }
}
