/**
 * Marble Enrichment Pipeline
 *
 * Reads the current KG state, identifies relevant enrichment categories based
 * on signals in the user's interests/preferences/identities, builds a single
 * comprehensive LLM prompt, parses the JSON response, and appends new
 * suggestion objects to kg.user.suggestions.
 *
 * Export: async function runEnrichment(kg, openAiOptions)
 */

// ── Signal → category mapping ────────────────────────────────────────────────

const CATEGORY_RULES = [
  {
    id: 'sci_fi_movies',
    label: 'Sci-Fi Movies',
    count: 10,
    match: (text) => /sci.?fi|scifi/i.test(text),
    needsCity: false,
  },
  {
    id: 'sci_fi_series',
    label: 'Sci-Fi Series',
    count: 10,
    match: (text) => /sci.?fi|scifi/i.test(text),
    needsCity: false,
  },
  {
    id: 'action_movies',
    label: 'Action Movies',
    count: 10,
    match: (text) => /\baction\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'comedy_movies',
    label: 'Comedy Movies',
    count: 10,
    match: (text) => /\bcomedy\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'comedy_series',
    label: 'Comedy Series',
    count: 8,
    match: (text) => /\bcomedy\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'football_clubs',
    label: 'Football Clubs',
    count: 10,
    match: (text) => /\b(football|soccer)\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'football_players',
    label: 'Football Players',
    count: 10,
    match: (text) => /\b(football|soccer)\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'basketball_players',
    label: 'Basketball Players',
    count: 10,
    match: (text) => /\bbasketball\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'japanese_restaurants',
    label: 'Japanese Restaurants',
    count: 10,
    match: (text) => /\bjapanese\b/i.test(text),
    needsCity: true,
  },
  {
    id: 'italian_restaurants',
    label: 'Italian Restaurants',
    count: 8,
    match: (text) => /\bitalian\b/i.test(text),
    needsCity: true,
  },
  {
    id: 'mediterranean_restaurants',
    label: 'Mediterranean Restaurants',
    count: 8,
    match: (text) => /\bmediterranean\b/i.test(text),
    needsCity: true,
  },
  {
    id: 'beach_destinations',
    label: 'Beach Destinations',
    count: 8,
    match: (text) => /\b(beach|beachwear)\b/i.test(text),
    needsCity: true,
  },
  {
    id: 'travel_destinations',
    label: 'Travel Destinations',
    count: 10,
    match: (text) => /\btravel\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'family_activities',
    label: 'Family Activities',
    count: 8,
    match: (text) => /\b(father|mother|parent|has_young|has_teen)\b/i.test(text),
    needsCity: true,
  },
  {
    id: 'music_artists',
    label: 'Music Artists',
    count: 10,
    match: (text) => /\bmusic\b/i.test(text),
    needsCity: false,
  },
  {
    id: 'local_events',
    label: 'Local Events & Meetups',
    count: 10,
    match: () => true,
    needsCity: true,
  },
  {
    id: 'local_news_english',
    label: 'Local News in English',
    count: 8,
    match: () => true,
    needsCity: true,
  },
  {
    id: 'local_news_local_language',
    label: 'Local News in Local Language',
    count: 8,
    match: () => true,
    needsCity: true,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Collect all signal strings from the KG (interests, preferences, identities, beliefs).
 * Returns a flat array of lowercase strings.
 */
function collectSignals(kg) {
  const signals = [];

  for (const interest of kg.user.interests ?? []) {
    if (interest.topic) signals.push(interest.topic);
  }

  for (const pref of kg.getActivePreferences()) {
    if (pref.type) signals.push(pref.type);
    if (pref.description) signals.push(pref.description);
  }

  for (const identity of kg.getActiveIdentities()) {
    if (identity.role) signals.push(identity.role);
    if (identity.context) signals.push(identity.context);
  }

  for (const belief of kg.getActiveBeliefs()) {
    if (belief.topic) signals.push(belief.topic);
    if (belief.claim) signals.push(belief.claim);
  }

  return signals;
}

/**
 * Attempt to extract the city from KG identities or beliefs.
 * Returns null if not found.
 */
function extractCity(kg) {
  for (const identity of kg.getActiveIdentities()) {
    // Identity context often contains "lives in <city>" or similar
    if (identity.context) {
      const m = identity.context.match(/(?:lives?\s+in|from|city[:\s]+|based\s+in)\s+([A-Za-z\s]+?)(?:\s*[,.]|$)/i);
      if (m) return m[1].trim();
    }
    // Role itself might be city-like for location identities
    if (/^(?:from|lives?\s+in)\s+(.+)/i.test(identity.role)) {
      const m = identity.role.match(/^(?:from|lives?\s+in)\s+(.+)/i);
      if (m) return m[1].trim();
    }
  }

  for (const belief of kg.getActiveBeliefs()) {
    if (/\bcity\b/i.test(belief.topic) && belief.claim) {
      return belief.claim.trim();
    }
    if (/^(?:lives?\s+in|based\s+in)\s+(.+)/i.test(belief.claim)) {
      const m = belief.claim.match(/^(?:lives?\s+in|based\s+in)\s+(.+)/i);
      if (m) return m[1].trim();
    }
  }

  return null;
}

/**
 * Determine which enrichment categories to generate based on KG signals.
 * Returns an array of category rule objects (with city injected when needed).
 */
function selectCategories(kg) {
  const signals = collectSignals(kg);
  const signalText = signals.join(' ');
  const city = extractCity(kg);

  const selected = [];
  const seen = new Set();

  for (const rule of CATEGORY_RULES) {
    if (seen.has(rule.id)) continue;
    if (rule.needsCity && !city) continue;
    if (rule.match(signalText)) {
      seen.add(rule.id);
      selected.push({ ...rule, city: city ?? null });
    }
  }

  return selected;
}

/**
 * Build the LLM prompt string.
 */
function buildPrompt(kg, categories) {
  const user = kg.user;

  const interests = [...(user.interests ?? [])]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 15)
    .map(i => i.topic)
    .join(', ') || 'none';

  const prefs = kg.getActivePreferences()
    .slice(0, 15)
    .map(p => `[${p.type}] ${p.description}`)
    .join(', ') || 'none';

  const moviePrefs = kg.getActivePreferences()
    .filter(p => /movie|film|cinema|entertain|genre|series/i.test(p.type + ' ' + p.description))
    .slice(0, 10)
    .map(p => p.description)
    .join(', ') || 'none';

  const identities = kg.getActiveIdentities()
    .slice(0, 10)
    .map(id => id.role + (id.context ? ` (${id.context})` : ''))
    .join(', ') || 'none';

  const city = extractCity(kg) ?? 'unknown';

  const categoryList = categories.map(c => {
    const locationNote = c.needsCity && c.city ? ` near/in ${c.city}` : '';
    return `  - ${c.id} (${c.label}${locationNote}): generate exactly ${c.count} items`;
  }).join('\n');

  return `You are enriching a personalization knowledge graph. Generate highly personalised content suggestions for this user.

User profile summary:
- Interests: ${interests}
- Food preferences: ${prefs}
- Movie/entertainment preferences: ${moviePrefs}
- Identities: ${identities}
- Location: ${city}

Generate suggestions ONLY for the following relevant categories:
${categoryList}

Category-specific guidance:
- local_events: Suggest recurring or well-known event series, venues, and meetup communities in the user's city that match their interests (e.g. tech meetups, sports events, food festivals, concerts, workshops). Include platform (Meetup.com, Eventbrite, etc.) and frequency in the description.
- local_news_english: Suggest English-language news websites, newsletters, or apps specific to the user's city or country. Include the URL, what topics they cover, and publication language in the description.
- local_news_local_language: Suggest local-language news sources (newspapers, TV news sites, radio sites, apps) in the primary language(s) spoken in the user's city/country. Include the URL, language, and editorial focus in the description.

Return ONLY valid JSON, no markdown, no explanation:
{
  "categories": [
    {
      "id": "sci_fi_movies",
      "label": "Sci-Fi Movies",
      "reasoning": "You have sci-fi in your interests",
      "items": [
        {
          "id": "movie-interstellar",
          "label": "Interstellar",
          "description": "Epic sci-fi about space travel and time dilation — Christopher Nolan, 2014",
          "tags": ["sci-fi", "drama"]
        }
      ]
    }
  ]
}`;
}

/**
 * Try to parse JSON from a raw LLM response.
 * Handles both clean JSON and markdown-wrapped JSON blocks.
 */
function parseJsonResponse(raw) {
  // First attempt: direct parse
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Fall through
  }

  // Second attempt: extract from markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Fall through
    }
  }

  // Third attempt: find the outermost { ... } in the response
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // Fall through
    }
  }

  throw new Error('Could not parse JSON from LLM response');
}

/**
 * Call OpenAI chat completions and return the raw text response.
 */
async function callLlm(prompt, openAiOptions) {
  const { apiKey, baseUrl, model } = openAiOptions;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_completion_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the enrichment pipeline against the given KG.
 *
 * @param {object} kg - KnowledgeGraph instance
 * @param {{ apiKey: string, baseUrl: string, model: string }} openAiOptions
 * @returns {Promise<{ added: number, categories: string[] }>}
 */
export async function runEnrichment(kg, openAiOptions) {
  // Ensure suggestions array exists
  if (!Array.isArray(kg.user.suggestions)) {
    kg.user.suggestions = [];
  }

  // Select categories based on KG signals
  const categories = selectCategories(kg);

  // Nothing to enrich if no signals match
  if (categories.length === 0) {
    return { added: 0, categories: [] };
  }

  // Build and execute LLM prompt
  const prompt = buildPrompt(kg, categories);
  const rawResponse = await callLlm(prompt, openAiOptions);

  // Parse LLM response
  let parsed;
  try {
    parsed = parseJsonResponse(rawResponse);
  } catch (err) {
    console.error('[enrichment] Failed to parse LLM response:', err.message);
    return { added: 0, categories: [] };
  }

  if (!Array.isArray(parsed.categories)) {
    console.error('[enrichment] LLM response missing categories array');
    return { added: 0, categories: [] };
  }

  // Build existing id set for deduplication
  const existingIds = new Set((kg.user.suggestions ?? []).map(s => s.id));

  const now = new Date().toISOString();
  let added = 0;
  const addedCategories = [];

  for (const cat of parsed.categories) {
    if (!cat.id || !Array.isArray(cat.items)) continue;

    let categoryAdded = 0;

    for (const item of cat.items) {
      if (!item.id || !item.label) continue;
      if (existingIds.has(item.id)) continue;

      const suggestion = {
        id: item.id,
        category: cat.id,
        category_label: cat.label ?? cat.id,
        label: item.label,
        description: item.description ?? '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        reasoning: cat.reasoning ?? '',
        status: 'pending_feedback',
        created_at: now,
        decided_at: null,
      };

      kg.user.suggestions.push(suggestion);
      existingIds.add(item.id);
      added++;
      categoryAdded++;
    }

    if (categoryAdded > 0) {
      addedCategories.push(cat.id);
    }
  }

  if (added > 0) {
    await kg.save();
  }

  return { added, categories: addedCategories };
}
