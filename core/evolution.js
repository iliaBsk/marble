/**
 * Prism Evolution — Evolutionary Personalization
 *
 * Evolves clone variants to better predict user behavior.
 * Manages a population of clones with different weight configurations,
 * evaluates their fitness against actual user reactions, and evolves
 * the population to improve predictions over time.
 */

import { Clone } from './clone.js';
import { SCORE_WEIGHTS } from './types.js';

/**
 * Clone variant with custom weight configuration for evolutionary testing
 */
class CloneVariant extends Clone {
  constructor(kg, weights = null) {
    super(kg);
    this.weights = weights || { ...SCORE_WEIGHTS };
    this.fitness = 0;
    this.generation = 0;
    this.id = Math.random().toString(36).substr(2, 9);
  }

  /**
   * Clone this variant with potential mutations
   * @param {number} mutationRate - How much to mutate (0-1)
   * @returns {CloneVariant} New mutated variant
   */
  mutate(mutationRate = 0.1) {
    const newWeights = {};
    let totalWeight = 0;

    // Mutate each weight
    for (const [key, value] of Object.entries(this.weights)) {
      const mutation = (Math.random() - 0.5) * 2 * mutationRate;
      newWeights[key] = Math.max(0, Math.min(1, value + mutation));
      totalWeight += newWeights[key];
    }

    // Normalize weights to maintain relative proportions
    for (const key of Object.keys(newWeights)) {
      newWeights[key] = newWeights[key] / totalWeight;
    }

    const variant = new CloneVariant(this.kg, newWeights);
    variant.generation = this.generation + 1;
    return variant;
  }

  /**
   * Custom engagement prediction using evolved weights
   * @param {Object} story - Story to evaluate
   * @returns {number} Engagement probability (0-1)
   */
  wouldEngage(story) {
    const s = this._snapshot || this.takeSnapshot();
    let score = 0.1; // base score

    // Topic match weighted by evolved interest_match weight
    let topicMatch = 0;
    for (const topic of story.topics || []) {
      const interest = s.interests[topic];
      if (interest) {
        topicMatch = Math.max(topicMatch, interest.weight);
      }
    }
    score += topicMatch * this.weights.interest_match;

    // Temporal relevance (fresher content gets higher weight)
    const hours = (Date.now() - new Date(story.published_at)) / (1000 * 60 * 60);
    const freshness = Math.max(0, 1 - hours / 24); // decay over 24 hours
    score += freshness * this.weights.temporal_relevance;

    // Source trust
    const trust = s.source_trust[story.source] ?? 0.5;
    score += trust * this.weights.source_trust;

    // Actionability (if story has actionable content)
    const actionability = story.actionability ?? 0.3;
    score += actionability * this.weights.actionability;

    // Novelty (simplified as inverse topic frequency)
    const novelty = story.novelty ?? 0.5;
    score += novelty * this.weights.novelty;

    return Math.min(1, score);
  }
}

/**
 * Manages a population of clone variants for evolutionary optimization
 */
export class ClonePopulation {
  /**
   * @param {KnowledgeGraph} kg - Knowledge graph instance
   * @param {number} populationSize - Number of clones to maintain
   */
  constructor(kg, populationSize = 20) {
    this.kg = kg;
    this.populationSize = populationSize;
    this.variants = [];
    this.generation = 0;
    this.fitnessHistory = [];

    this._initializePopulation();
  }

  /**
   * Initialize population with random weight variations
   * @private
   */
  _initializePopulation() {
    // Start with baseline clone
    this.variants.push(new CloneVariant(this.kg));

    // Generate variants with different weight distributions
    for (let i = 1; i < this.populationSize; i++) {
      const weights = {};
      let total = 0;

      // Random weight distribution
      for (const key of Object.keys(SCORE_WEIGHTS)) {
        weights[key] = Math.random();
        total += weights[key];
      }

      // Normalize
      for (const key of Object.keys(weights)) {
        weights[key] = weights[key] / total;
      }

      this.variants.push(new CloneVariant(this.kg, weights));
    }
  }

  /**
   * Evaluate fitness of a clone against actual user reactions
   * @param {CloneVariant} clone - Clone to evaluate
   * @param {Array} actualReactions - [{storyId, story, reaction, prediction}]
   * @returns {number} Fitness score (0-1, higher is better)
   */
  evaluateFitness(clone, actualReactions) {
    if (actualReactions.length === 0) return 0.5;

    let correct = 0;
    let total = actualReactions.length;

    for (const { story, reaction, prediction } of actualReactions) {
      const clonePrediction = clone.wouldEngage(story);

      // Convert reaction to binary engagement
      const actualEngagement = ['up', 'share'].includes(reaction) ? 1 : 0;
      const predictedEngagement = clonePrediction > 0.5 ? 1 : 0;

      // Score based on accuracy
      if (actualEngagement === predictedEngagement) {
        correct++;
      }

      // Bonus for confidence alignment
      const confidence = Math.abs(clonePrediction - 0.5) * 2; // 0-1
      const actualConfidence = actualEngagement;
      const confidenceDiff = Math.abs(confidence - actualConfidence);
      correct += (1 - confidenceDiff) * 0.3; // partial credit
    }

    return Math.min(1, correct / total);
  }

  /**
   * Evolve the population: kill weak clones, mutate survivors, spawn new variants
   * @param {Array} reactionData - Recent user reactions for fitness evaluation
   */
  evolve(reactionData = []) {
    // Evaluate fitness for all variants
    for (const variant of this.variants) {
      variant.fitness = this.evaluateFitness(variant, reactionData);
    }

    // Sort by fitness (highest first)
    this.variants.sort((a, b) => b.fitness - a.fitness);

    // Record generation stats
    const avgFitness = this.variants.reduce((sum, v) => sum + v.fitness, 0) / this.variants.length;
    const maxFitness = this.variants[0].fitness;
    this.fitnessHistory.push({ generation: this.generation, avgFitness, maxFitness });

    // Kill bottom 20%
    const killCount = Math.floor(this.populationSize * 0.2);
    this.variants = this.variants.slice(0, this.populationSize - killCount);

    // Generate new variants from survivors
    const survivors = this.variants.slice();
    while (this.variants.length < this.populationSize) {
      // Select parent based on fitness-weighted selection
      const parent = this._selectParent(survivors);

      // Create mutated offspring
      const mutationRate = 0.1 + (0.1 * Math.random()); // 10-20% mutation
      const offspring = parent.mutate(mutationRate);
      this.variants.push(offspring);
    }

    this.generation++;
  }

  /**
   * Select parent for reproduction based on fitness
   * @param {CloneVariant[]} survivors - Available parents
   * @returns {CloneVariant} Selected parent
   * @private
   */
  _selectParent(survivors) {
    // Fitness-proportionate selection (roulette wheel)
    const totalFitness = survivors.reduce((sum, v) => sum + v.fitness, 0);
    const rand = Math.random() * totalFitness;

    let accumulated = 0;
    for (const variant of survivors) {
      accumulated += variant.fitness;
      if (accumulated >= rand) {
        return variant;
      }
    }

    // Fallback to best variant
    return survivors[0];
  }

  /**
   * Get the highest-fitness clone for production use
   * @returns {CloneVariant} Best performing clone
   */
  getBestClone() {
    if (this.variants.length === 0) return null;

    return this.variants.reduce((best, current) =>
      current.fitness > best.fitness ? current : best
    );
  }

  /**
   * Get population statistics
   * @returns {Object} Stats about current population
   */
  getStats() {
    const fitness = this.variants.map(v => v.fitness);
    return {
      generation: this.generation,
      populationSize: this.variants.length,
      avgFitness: fitness.reduce((sum, f) => sum + f, 0) / fitness.length,
      maxFitness: Math.max(...fitness),
      minFitness: Math.min(...fitness),
      diversityScore: this._calculateDiversity()
    };
  }

  /**
   * Calculate weight diversity across population
   * @returns {number} Diversity score (0-1, higher is more diverse)
   * @private
   */
  _calculateDiversity() {
    if (this.variants.length < 2) return 0;

    const weightKeys = Object.keys(SCORE_WEIGHTS);
    let totalVariance = 0;

    for (const key of weightKeys) {
      const values = this.variants.map(v => v.weights[key]);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      totalVariance += variance;
    }

    return Math.min(1, totalVariance * weightKeys.length * 4); // normalized diversity
  }
}

/**
 * Utility function for standalone fitness evaluation
 * @param {CloneVariant} clone - Clone to evaluate
 * @param {Array} actualReactions - User reaction data
 * @returns {number} Fitness score
 */
export function evaluateFitness(clone, actualReactions) {
  const population = new ClonePopulation(clone.kg, 1);
  return population.evaluateFitness(clone, actualReactions);
}