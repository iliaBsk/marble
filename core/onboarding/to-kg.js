/**
 * Pure function: converts validated OnboardingAnswers into a normalized KG seed.
 * No LLM, no network, no side effects.
 *
 * @param {import('./schema.js').OnboardingAnswers} answers
 * @returns {KgSeed}
 */

/**
 * @typedef {Object} KgSeed
 * @property {Array<{topic:string,claim:string,strength:number}>} beliefs
 * @property {Array<{type:string,description:string,strength:number}>} preferences
 * @property {Array<{role:string,context:string,salience:number}>} identities
 * @property {Array<{topic:string,amount:number}>} interests
 * @property {Record<string,number>} confidence
 * @property {Array<{topic:string,claim:string,strength:number}>} gaps
 */

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function answersToKgSeed(answers) {
  /** @type {KgSeed} */
  const seed = { beliefs: [], preferences: [], identities: [], interests: [], confidence: {}, gaps: [] };

  // ── Relationship status ──
  seed.identities.push({
    role: 'relationship_status',
    context: answers.maritalStatus,
    salience: 0.85,
  });

  // ── Age bracket (optional) ──
  if (answers.ageBracket) {
    seed.identities.push({ role: 'age_bracket', context: answers.ageBracket, salience: 0.8 });
  }

  // ── Kids ──
  seed.identities.push({
    role: 'parental_status',
    context: answers.kids,
    salience: 0.9,
  });

  // ── Movie genres ──
  for (const genre of answers.movieGenres) {
    seed.interests.push({ topic: `genre:${slug(genre)}`, amount: 0.6 });
    seed.preferences.push({ type: 'genre_preference', description: genre, strength: 0.7 });
  }
  if (answers.movieGenres.length > 0) {
    seed.confidence['entertainment'] = 0.6;
  }

  // ── Food preferences ──
  for (const food of answers.foodPreferences) {
    seed.interests.push({ topic: `food:${slug(food)}`, amount: 0.5 });
    seed.preferences.push({ type: 'cuisine_preference', description: food, strength: 0.7 });
  }

  // ── Allergies — treated as high-strength medical beliefs ──
  // Each allergy gets its own topic to avoid contradiction detection closing prior entries.
  const realAllergies = answers.allergies.filter(a => a !== 'none');
  for (const allergy of realAllergies) {
    seed.beliefs.push({
      topic: `dietary_restriction:${slug(allergy)}`,
      claim: `avoids ${allergy}`,
      strength: 0.95,
    });
  }
  if (answers.allergies.includes('none')) {
    seed.beliefs.push({ topic: 'dietary_restriction:none', claim: 'no known allergies', strength: 0.9 });
  }

  // ── Location ──
  const city = answers.location.city.trim();
  seed.identities.push({ role: 'location', context: city, salience: 0.9 });
  seed.interests.push({ topic: `city:${slug(city)}`, amount: 0.7 });
  if (answers.location.country) {
    seed.identities.push({ role: 'country', context: answers.location.country, salience: 0.7 });
  }

  // ── Favorite local shops ──
  for (const shop of answers.favoriteShops) {
    seed.preferences.push({ type: 'brand_preference', description: shop, strength: 0.75 });
    seed.interests.push({ topic: `brand:${slug(shop)}`, amount: 0.4 });
  }

  // ── Travel regions ──
  for (const region of answers.travel.regions) {
    seed.preferences.push({ type: 'travel_region_preference', description: region, strength: 0.7 });
    seed.interests.push({ topic: `region:${slug(region)}`, amount: 0.5 });
  }

  // ── Travel seasonal types ──
  for (const type of answers.travel.summerTypes) {
    seed.preferences.push({ type: 'travel_style', description: `summer:${type}`, strength: 0.7 });
  }
  for (const type of answers.travel.winterTypes) {
    seed.preferences.push({ type: 'travel_style', description: `winter:${type}`, strength: 0.7 });
  }

  // ── JTBD intent (freeform text) ──
  if (answers.freeform && answers.freeform.trim()) {
    seed.beliefs.push({ topic: 'jtbd:current', claim: answers.freeform.trim(), strength: 0.75 });
  }

  // ── Professional role ──
  if (answers.professional) {
    seed.identities.push({ role: 'professional_role', context: answers.professional, salience: 0.9 });
  }

  // ── Financial mindset ──
  if (answers.financialMindset) {
    seed.identities.push({ role: 'wealth_mindset', context: answers.financialMindset, salience: 0.75 });
  }

  // ── Values fingerprint ──
  if (answers.valuesFingerprint) {
    const vf = answers.valuesFingerprint;
    seed.beliefs.push({ topic: 'value:speed_vs_depth',           claim: vf.speedVsDepth,            strength: 0.7 });
    seed.beliefs.push({ topic: 'value:stability_vs_opportunity', claim: vf.stabilityVsOpportunity,  strength: 0.7 });
    seed.beliefs.push({ topic: 'value:local_vs_global',          claim: vf.localVsGlobal,            strength: 0.7 });
    seed.preferences.push({ type: 'ocean_conscientiousness', description: vf.speedVsDepth,            strength: 0.5 });
    seed.preferences.push({ type: 'ocean_openness',          description: vf.stabilityVsOpportunity,  strength: 0.5 });
  }

  // ── Passions ──
  if (answers.passions && answers.passions.length > 0) {
    for (const passion of answers.passions) {
      seed.interests.push({ topic: `passion:${slug(passion)}`, amount: 0.8 });
      seed.preferences.push({ type: 'passion_category', description: passion, strength: 0.8 });
    }
  }

  // ── Knowledge gaps for clone seeding ──
  // Gaps are omitted when the corresponding field was answered.
  const filledGaps = new Set();
  if (answers.professional)     filledGaps.add('gap:profession');
  if (answers.financialMindset) filledGaps.add('gap:income_bracket');

  const gapQuestions = [
    { topic: 'gap:profession',    claim: "What is the user's profession or industry?" },
    { topic: 'gap:income_bracket',claim: "What is the user's approximate income bracket?" },
    { topic: 'gap:fitness_habits',claim: "What are the user's fitness and health habits?" },
    { topic: 'gap:media_depth',   claim: 'Does the user prefer deep/niche or broad/mainstream media?' },
    { topic: 'gap:tech_affinity', claim: 'How tech-savvy is the user?' },
    { topic: 'gap:social_values', claim: "What are the user's social and political values?" },
  ];

  for (const gap of gapQuestions) {
    if (!filledGaps.has(gap.topic)) {
      seed.gaps.push({ ...gap, strength: 0.2 });
    }
  }

  return seed;
}
