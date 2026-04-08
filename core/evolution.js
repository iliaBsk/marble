/**
 * evolution.js — Archetype clone population management.
 *
 * Clones are user archetype hypotheses (gap → kgOverrides), NOT scoring weight configs.
 * Each clone extends the base KG with its own belief/preference/identity overrides
 * and makes predictions based on those. Fitness = prediction accuracy.
 *
 * Lifecycle:
 *   - Clone seeded from knowledge gap (see kg.js → seedClones)
 *   - Each incoming reaction is evaluated against clone's extended KG
 *   - Confidence rises/falls based on prediction accuracy
 *   - Clones with confidence < 0.15 after 10+ evaluations are killed
 *   - Clones with confidence > 0.75 breed one neighbour variant
 */

export class ClonePopulation {
  /**
   * @param {Object} kg   - KnowledgeGraph instance
   * @param {Function} llmCall - async (prompt: string) => string  (for evaluation)
   * @param {Object} [opts]
   * @param {number} [opts.killThreshold=0.15]
   * @param {number} [opts.minEvaluationsToKill=10]
   * @param {number} [opts.breedThreshold=0.75]
   */
  constructor(kg, llmCall, opts = {}) {
    this.kg = kg;
    this.llmCall = llmCall;
    this.killThreshold = opts.killThreshold ?? 0.15;
    this.minEvaluationsToKill = opts.minEvaluationsToKill ?? 10;
    this.breedThreshold = opts.breedThreshold ?? 0.75;
  }

  /**
   * Evaluate a clone against a new reaction.
   * The clone extends the base KG with its kgOverrides, makes a prediction,
   * then we compare that prediction to what actually happened.
   *
   * @param {import('./types.js').UserClone} clone
   * @param {Object} reaction  - { itemId, item, reaction: 'up'|'down'|'share'|'skip' }
   * @returns {Promise<boolean>} - whether the clone predicted correctly
   */
  async evaluateFitness(clone, reaction) {
    const { item, reaction: signal } = reaction;
    if (!item) return false;

    const actualEngaged = ['up', 'share'].includes(signal);

    // Build a description of the clone's extended KG view
    const overrideDesc = this._describeOverrides(clone.kgOverrides);

    const prompt = `A user with the following profile:
${overrideDesc}

Was shown this item: ${JSON.stringify({ title: item.title, domain: item.domain, tags: item.tags, metadata: item.metadata })}

Would this user engage positively with this item? Answer with ONLY "yes" or "no".`;

    let predictedEngaged = false;
    try {
      const answer = (await this.llmCall(prompt)).trim().toLowerCase();
      predictedEngaged = answer.startsWith('yes');
    } catch {
      // If LLM call fails, skip this evaluation
      return false;
    }

    const correct = predictedEngaged === actualEngaged;

    // Record evaluation on the clone
    clone.evaluations = clone.evaluations || [];
    clone.evaluations.push({
      signal,
      predicted: predictedEngaged,
      actual: actualEngaged,
      correct,
    });
    clone.lastScoredAt = Date.now();

    // Update confidence (learning rate 0.1)
    const lr = 0.1;
    if (correct) {
      clone.confidence = Math.min(1, clone.confidence + lr * (1 - clone.confidence));
    } else {
      clone.confidence = Math.max(0, clone.confidence - lr * clone.confidence);
    }

    this.kg.saveClone(clone);
    return correct;
  }

  /**
   * Run evolution step: evaluate all active clones against new reactions,
   * kill weak ones, breed strong ones.
   *
   * @param {Array} reactions - Array of reaction objects
   * @returns {Promise<{ killed: number, bred: number, active: number }>}
   */
  async evolve(reactions) {
    const clones = this.kg.getActiveClones();

    // Evaluate each clone against each reaction
    for (const clone of clones) {
      for (const reaction of reactions) {
        await this.evaluateFitness(clone, reaction);
      }
    }

    // Kill weak clones
    let killed = 0;
    for (const clone of this.kg.getActiveClones()) {
      if (
        clone.evaluations.length >= this.minEvaluationsToKill &&
        clone.confidence < this.killThreshold
      ) {
        this.kg.killClone(clone.id);
        killed++;
      }
    }

    // Breed strong clones (requires llm client, handled by kg.breedStrongClones)
    // We just return stats here; caller should invoke kg.breedStrongClones if desired.
    const active = this.kg.getActiveClones().length;

    return { killed, active };
  }

  /**
   * Get the highest-confidence active clone.
   * @returns {import('./types.js').UserClone|null}
   */
  getBestClone() {
    const clones = this.kg.getActiveClones();
    if (!clones.length) return null;
    return clones.reduce((best, c) => c.confidence > best.confidence ? c : best);
  }

  // ── Private ──────────────────────────────────────────

  _describeOverrides(kgOverrides) {
    if (!kgOverrides) return '(no overrides)';
    const lines = [];
    for (const b of kgOverrides.beliefs || [])     lines.push(`Belief: ${b.topic} = ${b.value}`);
    for (const p of kgOverrides.preferences || []) lines.push(`Preference: ${p.category} = ${p.value}`);
    for (const id of kgOverrides.identities || []) lines.push(`Identity: ${id.role} = ${id.value}`);
    return lines.join('\n') || '(no overrides)';
  }
}
