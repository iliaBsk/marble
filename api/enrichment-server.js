/**
 * Enrichment API routes for the Marble Profile Server.
 *
 * Mounts:
 *   POST /user-profile/enrichment/run          — run LLM enrichment pipeline
 *   GET  /user-profile/enrichment/pending       — list pending suggestions grouped by category
 *   POST /user-profile/enrichment/decide        — approve or reject a single suggestion
 *   POST /user-profile/enrichment/decide-batch  — approve or reject multiple suggestions
 */

import { runEnrichment } from '../core/enrichment/index.js';

// ── Category type → KG preference type mapping ───────────────────────────────

const CATEGORY_PREF_TYPE = {
  sci_fi_movies: 'entertainment',
  sci_fi_series: 'entertainment',
  action_movies: 'entertainment',
  comedy_movies: 'entertainment',
  comedy_series: 'entertainment',
  music_artists: 'entertainment',
  japanese_restaurants: 'restaurant',
  italian_restaurants: 'restaurant',
  mediterranean_restaurants: 'restaurant',
  beach_destinations: 'activity',
  travel_destinations: 'activity',
  family_activities: 'activity',
  football_clubs: 'sports',
  football_players: 'sports',
  basketball_players: 'sports',
  local_events: 'activity',
  local_news_english: 'media',
  local_news_local_language: 'media',
};

/**
 * Determine which preference type to use when approving a suggestion.
 * Falls back to 'activity' for unknown categories.
 */
function preferenceTypeForCategory(category) {
  return CATEGORY_PREF_TYPE[category] ?? 'activity';
}

// ── Decision logic (shared between single and batch) ─────────────────────────

/**
 * Apply a single approve/reject decision to the KG.
 * Mutates the suggestion object in place and, on approve, adds a KG preference.
 *
 * @param {object} kg - KnowledgeGraph instance
 * @param {string} id - suggestion id
 * @param {'approve'|'reject'} decision
 * @returns {boolean} true if the suggestion was found and updated
 */
function applyDecision(kg, id, decision) {
  const suggestions = kg.user.suggestions ?? [];
  const suggestion = suggestions.find(s => s.id === id);
  if (!suggestion) return false;

  const now = new Date().toISOString();

  if (decision === 'approve') {
    suggestion.status = 'approved';
    suggestion.decided_at = now;

    // Add as real KG node
    const prefType = preferenceTypeForCategory(suggestion.category);
    kg.addPreference(prefType, suggestion.label, 0.8);
  } else if (decision === 'reject') {
    suggestion.status = 'rejected';
    suggestion.decided_at = now;
  }

  return true;
}

// ── Route mounting ────────────────────────────────────────────────────────────

/**
 * Mount enrichment routes onto an Express app.
 *
 * @param {import('express').Application} app
 * @param {{ marble: object, openAiOptions: { apiKey: string, baseUrl: string, model: string } }} options
 */
export function mountEnrichment(app, { marble, openAiOptions }) {

  // ── POST /user-profile/enrichment/run ──────────────────────────────────────
  app.post('/user-profile/enrichment/run', async (req, res) => {
    if (!openAiOptions.apiKey) {
      res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }

    try {
      const result = await runEnrichment(marble.kg, openAiOptions);
      res.json({ success: true, added: result.added, categories: result.categories });
    } catch (err) {
      console.error('[enrichment] run error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /user-profile/enrichment/pending ──────────────────────────────────
  app.get('/user-profile/enrichment/pending', (req, res) => {
    try {
      const suggestions = marble.kg.user.suggestions ?? [];
      const pending = suggestions.filter(s => s.status === 'pending_feedback');

      // Group by category
      const categoryMap = new Map();

      for (const suggestion of pending) {
        const catId = suggestion.category;
        if (!categoryMap.has(catId)) {
          categoryMap.set(catId, {
            id: catId,
            label: suggestion.category_label,
            reasoning: suggestion.reasoning,
            items: [],
          });
        }
        categoryMap.get(catId).items.push({
          id: suggestion.id,
          label: suggestion.label,
          description: suggestion.description,
          tags: suggestion.tags,
          category: suggestion.category,
          category_label: suggestion.category_label,
          created_at: suggestion.created_at,
        });
      }

      res.json({ categories: Array.from(categoryMap.values()) });
    } catch (err) {
      console.error('[enrichment] pending error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /user-profile/enrichment/decide ──────────────────────────────────
  app.post('/user-profile/enrichment/decide', async (req, res) => {
    try {
      const { id, decision } = req.body ?? {};

      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'body must include id (string)' });
        return;
      }
      if (decision !== 'approve' && decision !== 'reject') {
        res.status(400).json({ error: 'decision must be "approve" or "reject"' });
        return;
      }

      const found = applyDecision(marble.kg, id, decision);
      if (!found) {
        res.status(404).json({ error: `suggestion not found: ${id}` });
        return;
      }

      await marble.kg.save();
      res.json({ success: true });
    } catch (err) {
      console.error('[enrichment] decide error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /user-profile/enrichment/decide-batch ────────────────────────────
  app.post('/user-profile/enrichment/decide-batch', async (req, res) => {
    try {
      const { decisions } = req.body ?? {};

      if (!Array.isArray(decisions)) {
        res.status(400).json({ error: 'body must include decisions array' });
        return;
      }

      let processed = 0;

      for (const { id, decision } of decisions) {
        if (!id || (decision !== 'approve' && decision !== 'reject')) continue;
        const found = applyDecision(marble.kg, id, decision);
        if (found) processed++;
      }

      if (processed > 0) {
        await marble.kg.save();
      }

      res.json({ success: true, processed });
    } catch (err) {
      console.error('[enrichment] decide-batch error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
