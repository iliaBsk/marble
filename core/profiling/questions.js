/**
 * Weekly profiling question generation and management.
 *
 * Fills profile gaps that passive content consumption can't infer:
 * marital status, family composition, employment, lifestyle, etc.
 *
 * Lifecycle: generated → pending → answered | skipped | auto_filled
 *
 * New questions are only generated when:
 *   1. No pending questions remain
 *   2. At least 7 days have passed since the last generation run
 */

const MAX_QUESTIONS = 10;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ── Reads ────────────────────────────────────────────────────────────────────

export function getPendingQuestions(kg) {
  return (kg.user.profilingQuestions ?? []).filter(q => q.status === 'pending');
}

export function getProfilingStats(kg) {
  const all = kg.user.profilingQuestions ?? [];
  return {
    total: all.length,
    pending: all.filter(q => q.status === 'pending').length,
    answered: all.filter(q => q.status === 'answered').length,
    skipped: all.filter(q => q.status === 'skipped').length,
    auto_filled: all.filter(q => q.status === 'auto_filled').length,
    lastGenerated: kg.user.lastProfilingGenerated ?? null,
  };
}

export function shouldGenerate(kg) {
  if (getPendingQuestions(kg).length > 0) return false;
  const last = kg.user.lastProfilingGenerated;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > WEEK_MS;
}

// ── Generation ───────────────────────────────────────────────────────────────

export async function generateQuestions(kg, llm) {
  if (!shouldGenerate(kg)) return { generated: 0, reason: 'not_due' };

  const prompt = buildGenerationPrompt(buildKgSummary(kg));
  let raw;
  try {
    raw = await llm(prompt);
  } catch (err) {
    throw new Error(`LLM error: ${err.message}`);
  }

  const questions = parseQuestionsJson(raw);
  if (!questions.length) return { generated: 0, reason: 'no_questions_parsed' };

  const now = new Date().toISOString();
  const newQuestions = questions.slice(0, MAX_QUESTIONS).map(q => ({
    id: q.id,
    question: q.question,
    category: q.category ?? 'general',
    kgTopics: Array.isArray(q.kgTopics) ? q.kgTopics : [],
    status: 'pending',
    answer: null,
    created_at: now,
    answered_at: null,
  }));

  if (!Array.isArray(kg.user.profilingQuestions)) kg.user.profilingQuestions = [];
  kg.user.profilingQuestions.push(...newQuestions);
  kg.user.lastProfilingGenerated = now;

  return { generated: newQuestions.length };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Mark a question answered and optionally apply KG updates.
 * kgUpdates: { interests?, beliefs?, identities?, preferences? }
 */
export function answerQuestion(kg, id, answer, kgUpdates) {
  const q = (kg.user.profilingQuestions ?? []).find(q => q.id === id);
  if (!q) return false;
  q.status = 'answered';
  q.answer = answer;
  q.answered_at = new Date().toISOString();
  if (kgUpdates) applyKgUpdates(kg, kgUpdates);
  return true;
}

/**
 * Use the LLM to extract structured KG updates from a free-text answer.
 * Returns { interests?, beliefs?, identities?, preferences? } or null on failure.
 */
export async function extractKgUpdates(question, answer, llm) {
  const prompt = `You are a profile extraction agent. Given a profile question and the user's answer, extract structured knowledge graph updates.

Question: ${question}
Answer: ${answer}

Return a JSON object with the relevant updates. Only include fields that the answer actually provides — omit anything not mentioned.

{
  "interests": ["topic string"],
  "beliefs": [{"topic": "snake_case_key", "claim": "concise factual claim", "strength": 0.7-0.95}],
  "identities": [{"role": "snake_case_role", "context": "brief context", "salience": 0.7-0.95}],
  "preferences": [{"type": "category", "description": "short description", "strength": 0.7-0.9}]
}

Rules:
- beliefs: use for facts about the user (location, family status, demographic attributes)
- identities: use for roles the user inhabits (parent, homeowner, etc.)
- interests: use for topics the user is interested in
- preferences: use for likes/dislikes (food, entertainment, lifestyle)
- strength/salience: 0.9+ only for definitive statements, 0.7-0.85 for inferred
- Return ONLY the JSON object, no explanation`;

  try {
    const raw = await llm(prompt);
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw.trim());
    const hasContent = ['interests', 'beliefs', 'identities', 'preferences']
      .some(k => Array.isArray(parsed[k]) && parsed[k].length > 0);
    return hasContent ? parsed : null;
  } catch {
    return null;
  }
}

export function dismissQuestion(kg, id) {
  const q = (kg.user.profilingQuestions ?? []).find(q => q.id === id);
  if (!q) return false;
  q.status = 'skipped';
  q.answered_at = new Date().toISOString();
  return true;
}

/**
 * Mark pending questions as auto_filled when the KG already contains the answer.
 * Called after organic KG updates (email ingestion, enrichment approvals, etc.).
 */
export function checkAutoFill(kg) {
  const pending = getPendingQuestions(kg);
  let filled = 0;
  for (const q of pending) {
    if (isAlreadyAnswered(kg, q)) {
      q.status = 'auto_filled';
      q.answered_at = new Date().toISOString();
      filled++;
    }
  }
  return filled;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function isAlreadyAnswered(kg, question) {
  const topics = question.kgTopics ?? [];
  if (!topics.length) return false;
  const beliefs = kg.getActiveBeliefs().map(b => b.topic.toLowerCase());
  const ids = kg.getActiveIdentities().map(i => i.role.toLowerCase());
  return topics.some(t => beliefs.includes(t.toLowerCase()) || ids.includes(t.toLowerCase()));
}

function applyKgUpdates(kg, updates) {
  if (Array.isArray(updates.interests)) {
    for (const topic of updates.interests) {
      if (typeof topic === 'string' && topic.trim()) kg.boostInterest(topic.trim(), 0.3);
    }
  }
  if (Array.isArray(updates.beliefs)) {
    for (const b of updates.beliefs) {
      if (b.topic && b.claim) kg.addBelief(b.topic, b.claim, b.strength ?? 0.85);
    }
  }
  if (Array.isArray(updates.identities)) {
    for (const i of updates.identities) {
      if (i.role) kg.addIdentity(i.role, i.context ?? '', i.salience ?? 0.85);
    }
  }
  if (Array.isArray(updates.preferences)) {
    for (const p of updates.preferences) {
      if (p.type && p.description) kg.addPreference(p.type, p.description, p.strength ?? 0.8);
    }
  }
}

function buildKgSummary(kg) {
  const user = kg.user;
  const interests = [...(user.interests ?? [])]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 15)
    .map(i => `  - ${i.topic} (${(i.weight ?? 0).toFixed(2)})`)
    .join('\n') || '  (none)';

  const beliefs = kg.getActiveBeliefs().slice(0, 15)
    .map(b => `  - [${b.topic}] ${b.claim}`)
    .join('\n') || '  (none)';

  const prefs = kg.getActivePreferences().slice(0, 15)
    .map(p => `  - [${p.type}] ${p.description}`)
    .join('\n') || '  (none)';

  const ids = kg.getActiveIdentities().slice(0, 10)
    .map(i => `  - ${i.role}${i.context ? ` (${i.context})` : ''}`)
    .join('\n') || '  (none)';

  return `Interests:\n${interests}\n\nBeliefs:\n${beliefs}\n\nPreferences:\n${prefs}\n\nIdentities:\n${ids}`;
}

function buildGenerationPrompt(kgSummary) {
  return `You are a profile enrichment agent. Analyze the user's current profile and generate targeted questions to fill the most important missing information.

## Current Profile
${kgSummary}

## Dimensions to Consider
- personal: age_range, gender, marital_status, relationship_status
- family: has_children, children_ages, household_size
- professional: industry, job_role, company_size, remote_or_office
- location: country, city, urban_suburban_rural
- lifestyle: diet (vegetarian/vegan/halal/etc), fitness_routine, alcohol, smoking
- entertainment: music_genres, film_genres, sports_teams, gaming
- health: exercise_frequency, any_dietary_restrictions
- finance: rough_income_bracket, home_owner_or_renter

## Instructions
- Only ask about dimensions COMPLETELY ABSENT from the profile above
- Generate up to ${MAX_QUESTIONS} questions, ordered most-important-first
- Be conversational and natural — not clinical or invasive
- Each question targets one specific, actionable piece of information

Return ONLY a valid JSON array (no markdown fences):
[
  {
    "id": "pq_<snake_case_topic>",
    "question": "<natural question text>",
    "category": "<personal|family|professional|location|lifestyle|entertainment|health|finance>",
    "kgTopics": ["<belief or identity topic the answer will populate>"]
  }
]`;
}

function parseQuestionsJson(raw) {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(match ? match[0] : raw.trim());
    return Array.isArray(arr) ? arr.filter(q => q.id && q.question) : [];
  } catch {
    return [];
  }
}
