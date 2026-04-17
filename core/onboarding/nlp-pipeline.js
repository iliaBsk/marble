/**
 * JTBD intent classification for onboarding freeform text.
 * Uses Claude Haiku for speed and cost efficiency.
 * Accepts an injected client for testing.
 */

/**
 * @typedef {Object} JtbdClassification
 * @property {string} jtbd_category
 * @property {string[]} topic_clusters
 * @property {number} urgency_score
 * @property {string} time_horizon
 */

const sanitizeCtx = (v) => String(v || 'unknown').replace(/[\n\r"]/g, ' ').slice(0, 40);

const PROMPT_TEMPLATE = (text, context) =>
  `Analyze this user statement and return JSON only.

User statement: "${text.replace(/"/g, '\\"').slice(0, 120)}"
User context: role=${sanitizeCtx(context.role)}, ageBracket=${sanitizeCtx(context.ageBracket)}

Return exactly this JSON structure with no other text:
{
  "jtbd_category": "grow_income|protect_assets|manage_costs|build_something|personal_development",
  "topic_clusters": ["topic1", "topic2"],
  "urgency_score": 0,
  "time_horizon": "immediate|short_term|long_term"
}`;

/**
 * Classifies freeform JTBD text using Claude Haiku.
 * Returns null on any failure — callers should treat null as "classification unavailable".
 *
 * @param {string} text
 * @param {{ role?: string, ageBracket?: string }} context
 * @param {object|null} [client] - injected Anthropic client (for tests); created from env if null
 * @returns {Promise<JtbdClassification|null>}
 */
export async function classifyJtbd(text, context = {}, client = null) {
  if (!client && !process.env.ANTHROPIC_API_KEY) return null;

  try {
    let resolvedClient = client;
    if (!resolvedClient) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      resolvedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    const response = await resolvedClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: PROMPT_TEMPLATE(text, context) }],
    });

    const raw = response.content[0].text.trim();
    const start = raw.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let end = -1;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) return null;

    let parsed;
    try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
    if (!parsed.jtbd_category || !Array.isArray(parsed.topic_clusters)) return null;

    return {
      jtbd_category:  String(parsed.jtbd_category),
      topic_clusters: parsed.topic_clusters.map(String),
      urgency_score:  Number(parsed.urgency_score) || 0,
      time_horizon:   String(parsed.time_horizon || 'short_term'),
    };
  } catch {
    return null;
  }
}
