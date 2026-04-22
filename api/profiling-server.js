/**
 * Profiling question routes.
 *
 * Mounts:
 *   GET  /user-profile/profiling/pending   — pending questions + stats
 *   POST /user-profile/profiling/generate  — trigger LLM question generation
 *   POST /user-profile/profiling/answer    — answer one or many questions (+ KG updates)
 *   POST /user-profile/profiling/dismiss   — skip a question
 */

import {
  getPendingQuestions,
  getProfilingStats,
  shouldGenerate,
  generateQuestions,
  answerQuestion,
  dismissQuestion,
  extractKgUpdates,
} from '../core/profiling/questions.js';

export function mountProfiling(app, { marble, llmFn }) {

  // ── GET /user-profile/profiling/pending ──────────────────────────────────
  app.get('/user-profile/profiling/pending', (req, res) => {
    try {
      res.json({
        questions: getPendingQuestions(marble.kg),
        stats: getProfilingStats(marble.kg),
        shouldGenerate: shouldGenerate(marble.kg),
      });
    } catch (err) {
      console.error('[profiling] pending error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /user-profile/profiling/generate ────────────────────────────────
  app.post('/user-profile/profiling/generate', async (req, res) => {
    if (!llmFn) {
      res.status(503).json({ error: 'LLM not configured' });
      return;
    }
    try {
      const result = await generateQuestions(marble.kg, llmFn);
      if (result.generated > 0) await marble.kg.save();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[profiling] generate error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /user-profile/profiling/answer ──────────────────────────────────
  // Accepts single: { id, answer, kgUpdates? }
  // Or batch:       { answers: [{ id, answer, kgUpdates? }] }
  // When kgUpdates is absent the LLM extracts them from the answer text.
  app.post('/user-profile/profiling/answer', async (req, res) => {
    try {
      const body = req.body ?? {};

      // Normalise to array
      const items = Array.isArray(body.answers)
        ? body.answers
        : [{ id: body.id, answer: body.answer, kgUpdates: body.kgUpdates }];

      let processed = 0;
      const missing = [];
      const extracted = [];

      for (const { id, answer, kgUpdates } of items) {
        if (!id || answer === undefined || answer === null) continue;

        // Find the question text for the extraction prompt
        const allQuestions = marble.kg.user.profilingQuestions ?? [];
        const question = allQuestions.find(q => q.id === id);
        if (!question) { missing.push(id); continue; }

        // If caller didn't supply kgUpdates, extract them with the LLM
        let updates = kgUpdates ?? null;
        if (!updates && llmFn) {
          updates = await extractKgUpdates(question.question, String(answer), llmFn);
          if (updates) extracted.push(id);
        }

        const found = answerQuestion(marble.kg, id, String(answer), updates);
        found ? processed++ : missing.push(id);
      }

      if (processed > 0) await marble.kg.save();
      res.json({ success: true, processed, missing, extracted });
    } catch (err) {
      console.error('[profiling] answer error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /user-profile/profiling/dismiss ─────────────────────────────────
  app.post('/user-profile/profiling/dismiss', async (req, res) => {
    try {
      const { id } = req.body ?? {};
      if (!id) {
        res.status(400).json({ error: 'body must include id' });
        return;
      }
      const found = dismissQuestion(marble.kg, id);
      if (!found) {
        res.status(404).json({ error: `question not found: ${id}` });
        return;
      }
      await marble.kg.save();
      res.json({ success: true });
    } catch (err) {
      console.error('[profiling] dismiss error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
