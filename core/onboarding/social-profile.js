/**
 * Social-profile inference from a Twitter/X handle.
 * Uses OpenAI Responses API with web_search_preview to research the public profile,
 * then returns a structured enrichment + minimal seed data for source seeding.
 */

import OpenAI from 'openai';
import { applyEnrichmentToKg } from './apply-to-kg.js';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_TIMEOUT_MS = 120_000;

function buildPrompt(handle) {
  return `You are a user-persona inference agent for a content personalization engine.

Your task: research the public Twitter/X profile @${handle} and infer a detailed user persona.

Steps:
1. Search for "site:x.com/${handle}" and "@${handle} twitter profile" to find their bio, pinned tweet, and a sample of recent posts.
2. Analyze the content they post: topics, language, tone, mentions, hashtags, linked content, engagement patterns.
3. Look at who they follow or interact with if visible, and any linked websites or projects.
4. Infer a complete persona from this evidence.

Return ONLY valid JSON in exactly this shape (no prose, no markdown):
{
  "handle": "${handle}",
  "displayName": "string or null",
  "inferredBio": "1-2 sentence inferred description of this person",
  "location": { "city": "inferred city or null", "country": "inferred country or null" },
  "ageBracket": "20s|30s|40s|50s|60s+|unknown",
  "language": "primary language code, e.g. en|es|fr|ca",
  "professional": "founder|executive|investor|professional|other|unknown",
  "passions": ["choose 1-3 from: health-fitness, family, travel, investing, sports, technology, food-lifestyle, arts-culture"],
  "foodPreferences": ["choose 0-3 from: mediterranean, vegan, vegetarian, keto, high-protein, comfort, street-food, fine-dining, asian, latin, middle-eastern, japanese, indian, mexican, italian"],
  "movieGenres": ["choose 0-3 from: action, comedy, drama, sci-fi, thriller, horror, romance, documentary, animation, fantasy, mystery, biography, history, music, sport, western, crime, family"],
  "beliefs": [{ "topic": "string ≤200 chars", "claim": "string ≤500 chars", "strength": 0.3 }],
  "preferences": [{ "type": "string ≤100 chars", "description": "string ≤300 chars", "strength": 0.3 }],
  "identities": [{ "role": "string ≤100 chars", "context": "string ≤300 chars", "salience": 0.3 }],
  "interests": [{ "topic": "slug-style topic e.g. football, startup-investing, street-photography", "amount": 0.3 }],
  "confidence": { "lifestyle": 0.0, "technology": 0.0, "finance": 0.0, "health": 0.0, "culture": 0.0, "sports": 0.0, "travel": 0.0, "food": 0.0 },
  "sources": ["short excerpt or observation that supports an inference — max 5 items"]
}

Guidelines:
- Aim for 8-15 beliefs, 6-12 preferences, 3-6 identities, 10-20 interests.
- Strength/salience/amount: 0.3 = weak signal, 0.7 = clear repeated pattern.
- If the account is private/suspended/few posts, set all confidence to 0.1 and return valid JSON.
- city/country: infer from language, mentions, timezone clues — null if unknown.`;
}

function buildPostsPrompt(postsText, handle) {
  const ctx = handle ? `for the Twitter/X user @${handle}` : 'for a Twitter/X user';
  return `You are a user-persona inference agent for a content personalization engine.

Your task: analyze the following profile data ${ctx} and infer a detailed user persona.

PROFILE DATA:
${postsText.slice(0, 40000)}

Analyze topics, tone, language, mentioned places, and personal details.

Return ONLY valid JSON in exactly this shape (no prose, no markdown):
{
  "handle": ${JSON.stringify(handle || '')},
  "displayName": "string or null",
  "inferredBio": "1-2 sentence inferred description of this person",
  "location": { "city": "inferred city or null", "country": "inferred country or null" },
  "ageBracket": "20s|30s|40s|50s|60s+|unknown",
  "language": "primary language code, e.g. en|es|fr|ca",
  "professional": "founder|executive|investor|professional|other|unknown",
  "passions": ["choose 1-3 from: health-fitness, family, travel, investing, sports, technology, food-lifestyle, arts-culture"],
  "foodPreferences": ["choose 0-3 from: mediterranean, vegan, vegetarian, keto, high-protein, comfort, street-food, fine-dining, asian, latin, middle-eastern, japanese, indian, mexican, italian"],
  "movieGenres": ["choose 0-3 from: action, comedy, drama, sci-fi, thriller, horror, romance, documentary, animation, fantasy, mystery, biography, history, music, sport, western, crime, family"],
  "beliefs": [{ "topic": "≤200 chars", "claim": "≤500 chars", "strength": 0.3 }],
  "preferences": [{ "type": "≤100 chars", "description": "≤300 chars", "strength": 0.3 }],
  "identities": [{ "role": "≤100 chars", "context": "≤300 chars", "salience": 0.3 }],
  "interests": [{ "topic": "slug e.g. street-photography", "amount": 0.3 }],
  "confidence": { "lifestyle": 0.0, "technology": 0.0, "finance": 0.0, "health": 0.0, "culture": 0.0, "sports": 0.0, "travel": 0.0, "food": 0.0 },
  "sources": ["observation from data — max 5"]
}

Guidelines: 8-15 beliefs, 6-12 preferences, 3-6 identities, 10-20 interests. Strength 0.3=weak, 0.7=clear pattern.`;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text;
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;
  try { return JSON.parse(braceMatch[0]); } catch { return null; }
}

const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const num = (v) => typeof v === 'number' && isFinite(v);

function normalizeProfile(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const loc = (r.location && typeof r.location === 'object') ? r.location : {};
  const city = (typeof loc.city === 'string' && loc.city.trim()) ? loc.city.trim() : null;
  const country = (typeof loc.country === 'string' && loc.country.trim()) ? loc.country.trim() : null;

  const VALID_PASSIONS = new Set(['health-fitness','family','travel','investing','sports','technology','food-lifestyle','arts-culture']);
  const VALID_FOOD = new Set(['mediterranean','vegan','vegetarian','keto','high-protein','comfort','street-food','fine-dining','asian','latin','middle-eastern','japanese','indian','mexican','italian']);
  const VALID_GENRES = new Set(['action','comedy','drama','sci-fi','thriller','horror','romance','documentary','animation','fantasy','mystery','biography','history','music','sport','western','crime','family']);
  const VALID_AGE = new Set(['20s','30s','40s','50s','60s+','unknown']);
  const VALID_PROF = new Set(['founder','executive','investor','professional','other','unknown']);

  return {
    handle: typeof r.handle === 'string' ? r.handle : '',
    displayName: typeof r.displayName === 'string' ? r.displayName : null,
    inferredBio: typeof r.inferredBio === 'string' ? r.inferredBio.slice(0, 400) : '',
    location: { city, country },
    ageBracket: VALID_AGE.has(r.ageBracket) ? r.ageBracket : 'unknown',
    language: typeof r.language === 'string' ? r.language.slice(0, 5) : 'en',
    professional: VALID_PROF.has(r.professional) ? r.professional : 'unknown',
    passions: Array.isArray(r.passions) ? r.passions.filter(p => VALID_PASSIONS.has(p)).slice(0, 3) : [],
    foodPreferences: Array.isArray(r.foodPreferences) ? r.foodPreferences.filter(f => VALID_FOOD.has(f)).slice(0, 3) : [],
    movieGenres: Array.isArray(r.movieGenres) ? r.movieGenres.filter(g => VALID_GENRES.has(g)).slice(0, 3) : [],
    beliefs: Array.isArray(r.beliefs) ? r.beliefs.filter(b => b && str(b.topic, 200) && str(b.claim, 500) && num(b.strength)) : [],
    preferences: Array.isArray(r.preferences) ? r.preferences.filter(p => p && str(p.type, 100) && str(p.description, 300) && num(p.strength)) : [],
    identities: Array.isArray(r.identities) ? r.identities.filter(id => id && str(id.role, 100) && str(id.context, 300) && num(id.salience)) : [],
    interests: Array.isArray(r.interests) ? r.interests.filter(i => i && str(i.topic, 200) && num(i.amount)) : [],
    confidence: (r.confidence && typeof r.confidence === 'object') ? Object.fromEntries(Object.entries(r.confidence).filter(([k, v]) => str(k, 100) && num(v))) : {},
    sources: Array.isArray(r.sources) ? r.sources.filter(s => typeof s === 'string').slice(0, 10) : [],
  };
}

export async function inferProfileFromPosts(postsText, handle, opts = {}) {
  const { apiKey, baseUrl, model, client, signal, onProgress } = opts;

  const effectiveKey = apiKey || process.env.OPENAI_API_KEY;
  if (!effectiveKey && !client) throw new Error('OPENAI_API_KEY is required for post inference.');

  const openai = client || new OpenAI({ apiKey: effectiveKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  const resolvedModel = model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const timeoutSignal = signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  onProgress?.('researching', { handle: handle || 'posts' });

  const prompt = buildPostsPrompt(postsText, handle);
  const toText = (response) => (response.output || [])
    .flatMap(item => item.type === 'message' ? (item.content || []).filter(c => c.type === 'output_text').map(c => c.text || '') : [])
    .join('\n');

  let responseText = '';
  try {
    responseText = toText(await openai.responses.create(
      { model: resolvedModel, input: prompt, max_output_tokens: 5000 },
      { signal: timeoutSignal }
    ));
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      throw Object.assign(new Error('Post inference timed out'), { name: 'AbortError' });
    }
    throw err;
  }

  let parsed = extractJson(responseText);
  if (!parsed) {
    try {
      responseText = toText(await openai.responses.create(
        { model: resolvedModel, input: `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON starting with { and ending with }. No prose.`, max_output_tokens: 5000 },
        { signal: timeoutSignal }
      ));
      parsed = extractJson(responseText);
    } catch { /* fall through to empty profile */ }
  }

  const profile = normalizeProfile(parsed);
  if (handle) profile.handle = handle;
  onProgress?.('inferred', { handle: handle || '', location: profile.location, passions: profile.passions });
  return profile;
}

export async function inferTwitterProfile(handle, opts = {}) {
  const { apiKey, baseUrl, model, client, signal, onProgress } = opts;

  const effectiveKey = apiKey || process.env.OPENAI_API_KEY;
  if (!effectiveKey && !client) throw new Error('OPENAI_API_KEY is required for social profile inference.');

  const openai = client || new OpenAI({ apiKey: effectiveKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  const resolvedModel = model || process.env.OPENAI_DEEP_RESEARCH_MODEL || DEFAULT_MODEL;
  const timeoutSignal = signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  onProgress?.('researching', { handle });

  const prompt = buildPrompt(handle);
  let responseText = '';

  try {
    const response = await openai.responses.create(
      { model: resolvedModel, tools: [{ type: 'web_search_preview' }], input: prompt, max_output_tokens: 5000 },
      { signal: timeoutSignal }
    );
    responseText = (response.output || [])
      .flatMap(item => item.type === 'message' ? (item.content || []).filter(c => c.type === 'output_text').map(c => c.text || '') : [])
      .join('\n');
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      throw Object.assign(new Error('Social profile research timed out'), { name: 'AbortError' });
    }
    throw err;
  }

  let parsed = extractJson(responseText);
  if (!parsed) {
    onProgress?.('retrying', { reason: 'json_parse_failed' });
    try {
      const retry = await openai.responses.create(
        { model: resolvedModel, input: `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON starting with { and ending with }. No prose.`, max_output_tokens: 5000 },
        { signal: timeoutSignal }
      );
      const retryText = (retry.output || [])
        .flatMap(item => item.type === 'message' ? (item.content || []).filter(c => c.type === 'output_text').map(c => c.text || '') : [])
        .join('\n');
      parsed = extractJson(retryText);
    } catch { /* return empty profile on total failure */ }
  }

  const profile = normalizeProfile(parsed);
  onProgress?.('inferred', { handle, location: profile.location, passions: profile.passions });
  return profile;
}

export function applySocialProfileToKg(kg, profile) {
  const enrichment = {
    beliefs: [...profile.beliefs],
    preferences: [...profile.preferences],
    identities: [...profile.identities],
    interests: [...profile.interests],
    confidence: { ...profile.confidence },
  };

  if (profile.location.city) {
    enrichment.identities.push({ role: 'location', context: [profile.location.city, profile.location.country].filter(Boolean).join(', '), salience: 0.6 });
  }
  if (profile.ageBracket && profile.ageBracket !== 'unknown') {
    enrichment.identities.push({ role: 'age_bracket', context: profile.ageBracket, salience: 0.5 });
  }
  if (profile.professional && profile.professional !== 'unknown') {
    enrichment.identities.push({ role: 'professional_archetype', context: profile.professional, salience: 0.55 });
  }

  const passionWeights = { 'technology': 0.5, 'sports': 0.5, 'investing': 0.5, 'travel': 0.5, 'food-lifestyle': 0.5, 'arts-culture': 0.45, 'health-fitness': 0.45, 'family': 0.45 };
  for (const passion of profile.passions) {
    enrichment.interests.push({ topic: passion.replace(/-/g, '_'), amount: passionWeights[passion] ?? 0.4 });
  }

  if (profile.handle) {
    enrichment.identities.push({ role: 'twitter_handle', context: `@${profile.handle}`, salience: 0.3 });
  }

  return applyEnrichmentToKg(kg, enrichment);
}

export function parseHandle(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim()
    .replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com)\//, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
  return /^[a-zA-Z0-9_]{1,50}$/.test(cleaned) ? cleaned : null;
}

/**
 * @typedef {Object} SocialProfile
 * @property {string} handle
 * @property {string|null} displayName
 * @property {string} inferredBio
 * @property {{ city: string|null, country: string|null }} location
 * @property {string} ageBracket
 * @property {string} language
 * @property {string} professional
 * @property {string[]} passions
 * @property {string[]} foodPreferences
 * @property {string[]} movieGenres
 * @property {Array<{topic:string,claim:string,strength:number}>} beliefs
 * @property {Array<{type:string,description:string,strength:number}>} preferences
 * @property {Array<{role:string,context:string,salience:number}>} identities
 * @property {Array<{topic:string,amount:number}>} interests
 * @property {Record<string,number>} confidence
 * @property {string[]} sources
 */
