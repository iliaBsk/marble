/**
 * Applies a KG seed or deep-research enrichment to a KnowledgeGraph instance.
 * Only uses existing public KG methods — never mutates KG internals directly.
 */

/**
 * @param {import('../kg.js').KnowledgeGraph} kg
 * @param {import('./to-kg.js').KgSeed} seed
 * @returns {{ beliefs: number, preferences: number, identities: number, interests: number, gaps: number }}
 */
export function applyOnboardingToKg(kg, seed) {
  const counts = { beliefs: 0, preferences: 0, identities: 0, interests: 0, gaps: 0 };

  for (const b of seed.beliefs) {
    kg.addBelief(b.topic, b.claim, b.strength);
    counts.beliefs++;
  }

  for (const p of seed.preferences) {
    kg.addPreference(p.type, p.description, p.strength);
    counts.preferences++;
  }

  for (const id of seed.identities) {
    kg.addIdentity(id.role, id.context, id.salience);
    counts.identities++;
  }

  for (const interest of seed.interests) {
    kg.boostInterest(interest.topic, interest.amount);
    counts.interests++;
  }

  for (const [domain, confidence] of Object.entries(seed.confidence)) {
    kg.setDomainConfidence(domain, confidence);
  }

  for (const gap of seed.gaps) {
    kg.addBelief(gap.topic, gap.claim, gap.strength);
    counts.gaps++;
  }

  return counts;
}

/**
 * Applies deep-research enrichment to the KG.
 * Enrichment strengths are capped lower than user-stated values so real reactions dominate.
 * Skips any (topic/type+description) already present with equal or higher strength.
 *
 * @param {import('../kg.js').KnowledgeGraph} kg
 * @param {DeepResearchEnrichment} enrichment
 * @returns {{ beliefs: number, preferences: number, identities: number, interests: number, skipped: number }}
 */
export function applyEnrichmentToKg(kg, enrichment) {
  const MAX_BELIEF_STRENGTH = 0.7;
  const MAX_PREF_STRENGTH = 0.6;
  const counts = { beliefs: 0, preferences: 0, identities: 0, interests: 0, skipped: 0 };

  for (const b of (enrichment.beliefs || [])) {
    // Guard: never overwrite a high-confidence allergy/medical belief with inferred data
    const existing = kg.getBelief(b.topic);
    if (existing && existing.strength > MAX_BELIEF_STRENGTH) {
      counts.skipped++;
      continue;
    }
    kg.addBelief(b.topic, b.claim, Math.min(b.strength ?? 0.5, MAX_BELIEF_STRENGTH));
    counts.beliefs++;
  }

  for (const p of (enrichment.preferences || [])) {
    const active = kg.getPreferences(p.type);
    const existing = active.find(ap =>
      ap.description.toLowerCase() === p.description.toLowerCase()
    );
    if (existing && existing.strength > MAX_PREF_STRENGTH) {
      counts.skipped++;
      continue;
    }
    kg.addPreference(p.type, p.description, Math.min(p.strength ?? 0.5, MAX_PREF_STRENGTH));
    counts.preferences++;
  }

  for (const id of (enrichment.identities || [])) {
    const active = kg.getIdentities();
    const existing = active.find(ai => ai.role.toLowerCase() === id.role.toLowerCase());
    if (existing && existing.salience > 0.7) {
      counts.skipped++;
      continue;
    }
    kg.addIdentity(id.role, id.context, Math.min(id.salience ?? 0.5, 0.65));
    counts.identities++;
  }

  for (const interest of (enrichment.interests || [])) {
    kg.boostInterest(interest.topic, Math.min(interest.amount ?? 0.3, 0.4));
    counts.interests++;
  }

  for (const [domain, conf] of Object.entries(enrichment.confidence || {})) {
    const existing = kg.getDomainConfidence(domain);
    if (existing > conf) continue;
    kg.setDomainConfidence(domain, Math.min(conf, 0.65));
  }

  return counts;
}

/**
 * @typedef {Object} DeepResearchEnrichment
 * @property {Array<{topic:string,claim:string,strength:number}>} [beliefs]
 * @property {Array<{type:string,description:string,strength:number}>} [preferences]
 * @property {Array<{role:string,context:string,salience:number}>} [identities]
 * @property {Array<{topic:string,amount:number}>} [interests]
 * @property {Record<string,number>} [confidence]
 * @property {string[]} [citations]
 */
