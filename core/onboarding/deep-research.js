/**
 * Deep research enrichment via OpenAI Responses API with web_search_preview.
 * Infers lifestyle, interests, demographics, and cultural context from structured answers.
 */

import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 4000;
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * @param {import('./schema.js').OnboardingAnswers} answers
 * @returns {string}
 */
function buildResearchPrompt(answers) {
  // Defensive truncation — schema already validates ≤100 chars, but guard at LLM boundary too
  const city = answers.location.city.slice(0, 100);
  const shops = answers.favoriteShops.slice(0, 6).join(', ');
  const food = answers.foodPreferences.join(', ');
  const genres = answers.movieGenres.join(', ');
  const regions = answers.travel.regions.join(', ');
  const summer = answers.travel.summerTypes.join(', ');
  const winter = answers.travel.winterTypes.join(', ');
  const marital = answers.maritalStatus;
  const kids = answers.kids;

  return `You are a deep profiling agent building a knowledge graph for a content personalization engine.

A user has just completed onboarding with these answers:
- Location: ${city}
- Relationship status: ${marital}
- Kids: ${kids}
- Movie genres: ${genres}
- Food preferences: ${food}
- Favorite shops: ${shops || 'not specified'}
- Travel regions: ${regions || 'not specified'}
- Summer travel: ${summer || 'not specified'}
- Winter travel: ${winter || 'not specified'}

Your task:
1. Use web search to research the cultural lifestyle in ${city}, typical demographics of people who shop at [${shops}], lifestyle patterns associated with [${food}] diets, and travel patterns for [${regions}] travelers.
2. Infer 8–12 new beliefs about this user (profession likelihood, income bracket, hobbies, social values, tech affinity, fitness habits, news interests, etc.).
3. Infer 8–12 new content/topic preferences beyond what was stated.
4. Infer 2–4 additional identity attributes (profession archetype, lifestyle archetype, consumer archetype, etc.).
5. Suggest 8–10 new interest topics with weights 0.3–0.6.
6. Assign domain confidence scores (0–0.7) for: lifestyle, technology, finance, health, culture, sports, travel, food.

Return ONLY a JSON object in this exact shape:
{
  "beliefs": [{ "topic": "string", "claim": "string", "strength": 0.0-0.7 }],
  "preferences": [{ "type": "string", "description": "string", "strength": 0.0-0.6 }],
  "identities": [{ "role": "string", "context": "string", "salience": 0.0-0.65 }],
  "interests": [{ "topic": "string", "amount": 0.0-0.4 }],
  "confidence": { "domain": 0.0-0.7 }
}

Do NOT include any of the user's original stated preferences (those are already saved). Only add NEW inferences. Be specific and culturally accurate for ${city}.`;
}

/**
 * Extract a JSON object from an LLM response string.
 * Tries a fenced code block first, then falls back to brace extraction.
 * @param {string} text
 * @returns {Object|null}
 */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text;
  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;
  try {
    return JSON.parse(braceMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Validate and normalise the enrichment object returned by the LLM.
 * Returns a safe default if the shape is wrong.
 * @param {unknown} raw
 * @returns {import('./apply-to-kg.js').DeepResearchEnrichment}
 */
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const num = (v) => typeof v === 'number' && isFinite(v);

function normalizeEnrichment(raw) {
  const r = (raw && typeof raw === 'object') ? /** @type {Record<string,unknown>} */ (raw) : {};
  return {
    beliefs: Array.isArray(r.beliefs)
      ? r.beliefs.filter(b => b && str(b.topic, 200) && str(b.claim, 500) && num(b.strength))
      : [],
    preferences: Array.isArray(r.preferences)
      ? r.preferences.filter(p => p && str(p.type, 100) && str(p.description, 300) && num(p.strength))
      : [],
    identities: Array.isArray(r.identities)
      ? r.identities.filter(id => id && str(id.role, 100) && str(id.context, 300) && num(id.salience))
      : [],
    interests: Array.isArray(r.interests)
      ? r.interests.filter(i => i && str(i.topic, 200) && num(i.amount))
      : [],
    confidence: (r.confidence && typeof r.confidence === 'object')
      ? Object.fromEntries(
          Object.entries(r.confidence).filter(([k, v]) => str(k, 100) && num(v))
        )
      : {},
    citations: Array.isArray(r.citations)
      ? r.citations.filter(c => typeof c === 'string' && c.startsWith('https://'))
      : [],
  };
}

/**
 * Run deep research using OpenAI Responses API with web_search_preview.
 *
 * @param {Object} opts
 * @param {import('./schema.js').OnboardingAnswers} opts.answers
 * @param {OpenAI} [opts.client] - Injected client (for testing)
 * @param {string} [opts.model]
 * @param {number} [opts.maxOutputTokens]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<import('./apply-to-kg.js').DeepResearchEnrichment & { citations: string[] }>}
 */
export async function runDeepResearch({ answers, client, model, maxOutputTokens, signal }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey && !client) {
    throw new Error('OPENAI_API_KEY is required for deep research. Set it in your .env file.');
  }

  const openai = client || new OpenAI({ apiKey });
  const resolvedModel = model || process.env.OPENAI_DEEP_RESEARCH_MODEL || DEFAULT_MODEL;
  const maxTokens = maxOutputTokens || DEFAULT_MAX_TOKENS;
  const prompt = buildResearchPrompt(answers);

  // Abort support: wrap in a timeout if no signal provided
  const timeoutSignal = signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  let responseText;
  const citations = [];

  try {
    const response = await openai.responses.create(
      {
        model: resolvedModel,
        tools: [{ type: 'web_search_preview' }],
        input: prompt,
        max_output_tokens: maxTokens,
      },
      { signal: timeoutSignal }
    );

    // Extract text content from the response output
    const textParts = (response.output || [])
      .flatMap(item => {
        if (item.type === 'message') {
          return (item.content || [])
            .filter(c => c.type === 'output_text')
            .map(c => c.text || '');
        }
        return [];
      });

    responseText = textParts.join('\n');

    // Collect URL citations from annotations
    for (const item of (response.output || [])) {
      if (item.type === 'message') {
        for (const content of (item.content || [])) {
          for (const ann of (content.annotations || [])) {
            if (ann.type === 'url_citation' && ann.url) {
              citations.push(ann.url);
            }
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      throw Object.assign(new Error('Deep research timed out or was aborted'), { name: 'AbortError' });
    }
    throw err;
  }

  let parsed = extractJson(responseText || '');

  // One retry with an explicit JSON reminder
  if (!parsed) {
    try {
      const retry = await openai.responses.create(
        {
          model: resolvedModel,
          input: `${prompt}\n\nIMPORTANT: You MUST respond with ONLY a valid JSON object. No prose, no markdown, no explanation. Start with { and end with }.`,
          max_output_tokens: maxTokens,
        },
        { signal: timeoutSignal }
      );

      const retryText = (retry.output || [])
        .flatMap(item =>
          item.type === 'message'
            ? (item.content || []).filter(c => c.type === 'output_text').map(c => c.text || '')
            : []
        )
        .join('\n');

      parsed = extractJson(retryText);
    } catch {
      // Retry failed — return empty enrichment (deterministic seed still saved)
    }
  }

  const enrichment = normalizeEnrichment(parsed);
  return { ...enrichment, citations };
}
