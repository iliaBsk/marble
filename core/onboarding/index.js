/**
 * Onboarding orchestration — coordinates wizard answers → KG seed → deep research → KG enrichment.
 */

import { validateOnboardingAnswers } from './schema.js';
import { answersToKgSeed } from './to-kg.js';
import { applyOnboardingToKg, applyEnrichmentToKg } from './apply-to-kg.js';
import { runDeepResearch } from './deep-research.js';

/**
 * Full onboarding pipeline for a new user.
 *
 * @param {import('../kg.js').KnowledgeGraph} kg
 * @param {import('./schema.js').OnboardingAnswers} answers
 * @param {object} [opts]
 * @param {boolean} [opts.deepResearch=true] - Run OpenAI deep research pass
 * @param {object} [opts.llmClient] - Injected OpenAI client (for testing)
 * @param {AbortSignal} [opts.signal]
 * @param {(stage:string, payload?:object)=>void} [opts.onProgress] - SSE progress callback
 * @returns {Promise<OnboardingResult>}
 */
export async function onboardUser(kg, answers, opts = {}) {
  const { deepResearch = true, llmClient, signal, onProgress } = opts;

  const validation = validateOnboardingAnswers(answers);
  if (!validation.ok) {
    throw Object.assign(new Error('Invalid onboarding answers'), {
      code: 'VALIDATION_ERROR',
      errors: validation.errors,
    });
  }

  onProgress?.('validated');

  // Phase 1: Deterministic seed — always runs, no network
  const seed = answersToKgSeed(validation.value);
  const seedCounts = applyOnboardingToKg(kg, seed);

  onProgress?.('seed_applied', { counts: seedCounts });

  let enrichment = null;
  let enrichmentCounts = null;
  let enrichmentError = null;

  // Phase 2: Deep research — optional, gracefully degrades
  if (deepResearch) {
    onProgress?.('research_running');
    try {
      enrichment = await runDeepResearch({
        answers: validation.value,
        client: llmClient,
        signal,
      });
      enrichmentCounts = applyEnrichmentToKg(kg, enrichment);
      onProgress?.('research_done', { citations: enrichment.citations, counts: enrichmentCounts });
    } catch (err) {
      enrichmentError = err.message;
      // Non-fatal: deterministic seed is already applied
      onProgress?.('research_failed', { error: enrichmentError });
    }
  }

  onProgress?.('done');

  return {
    seed,
    seedCounts,
    enrichment,
    enrichmentCounts,
    enrichmentError,
    kgSummary: kg.getMemoryNodesSummary(),
  };
}

export { validateOnboardingAnswers } from './schema.js';
export { getShopsForCity, getKnownCities } from './shops-registry.js';
export { STEPS, getStep } from './steps.js';
export { answersToKgSeed } from './to-kg.js';

/**
 * @typedef {Object} OnboardingResult
 * @property {import('./to-kg.js').KgSeed} seed
 * @property {object} seedCounts
 * @property {import('./apply-to-kg.js').DeepResearchEnrichment|null} enrichment
 * @property {object|null} enrichmentCounts
 * @property {string|null} enrichmentError
 * @property {object} kgSummary
 */
