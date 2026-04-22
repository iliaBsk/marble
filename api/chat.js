/**
 * Chat endpoint logic for the Marble Profile UI.
 *
 * Builds a system prompt from the current KG state, calls OpenAI, and returns
 * both the cleaned prose reply and any parsed tool-call blocks.
 */

import { getPendingQuestions } from '../core/profiling/questions.js';

const TOOL_BLOCK_RE = /<tool>([\s\S]*?)<\/tool>/g;

/**
 * Build the system prompt summarising the current KG state.
 * @param {object} kg - KnowledgeGraph instance
 * @returns {string}
 */
function buildSystemPrompt(kg) {
  const user = kg.user;

  const interests = [...(user.interests ?? [])]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 20)
    .map(i => `  - ${i.topic} (weight: ${(i.weight ?? 0).toFixed(2)}, trend: ${i.trend ?? 'stable'})`)
    .join('\n') || '  (none)';

  const activeBeliefs = kg.getActiveBeliefs()
    .slice(0, 15)
    .map(b => `  - [${b.topic}] ${b.claim} (strength: ${(b.strength ?? 0).toFixed(2)})`)
    .join('\n') || '  (none)';

  const activePrefs = kg.getActivePreferences()
    .slice(0, 15)
    .map(p => `  - [${p.type}] ${p.description} (strength: ${(p.strength ?? 0).toFixed(2)})`)
    .join('\n') || '  (none)';

  const activeIds = kg.getActiveIdentities()
    .slice(0, 10)
    .map(id => `  - ${id.role}${id.context ? ` (${id.context})` : ''} (salience: ${(id.salience ?? 0).toFixed(2)})`)
    .join('\n') || '  (none)';

  const ctx = user.context ?? {};
  const ctxLines = [
    ctx.calendar?.length ? `  calendar: ${ctx.calendar.join(', ')}` : null,
    ctx.active_projects?.length ? `  active_projects: ${ctx.active_projects.join(', ')}` : null,
    ctx.recent_conversations?.length ? `  recent_conversations: ${ctx.recent_conversations.join(', ')}` : null,
    ctx.mood_signal ? `  mood_signal: ${ctx.mood_signal}` : null,
  ].filter(Boolean).join('\n') || '  (none)';

  const pendingQuestions = getPendingQuestions(kg);
  const pendingQuestionsSection = pendingQuestions.length > 0
    ? `\n\n## Pending Profile Questions (${pendingQuestions.length})\n` +
      pendingQuestions.map((q, i) => `${i + 1}. [ID: ${q.id}] ${q.question}`).join('\n')
    : '';

  return `You are a Marble Profile Assistant — an AI agent that helps explore and update a user's personalization knowledge graph (KG).

## Current KG State

### Interests (top 20 by weight)
${interests}

### Beliefs (active)
${activeBeliefs}

### Preferences (active)
${activePrefs}

### Identities (active)
${activeIds}

### Context
${ctxLines}${pendingQuestionsSection}

## Your Capabilities

You can suggest profile updates by including JSON tool blocks in your response.

To add interests, beliefs, identities, or preferences:
<tool>{"action":"facts","data":{"interests":["tennis"],"beliefs":[{"topic":"marital_status","claim":"married","strength":0.9}],"identities":[{"role":"parent","context":"2 kids","salience":0.9}]}}</tool>

To record a content reaction (up/down/skip/share):
<tool>{"action":"decisions","data":{"item":{"id":"item-1","topics":["tennis"],"source":"chat"},"reaction":"up"}}</tool>

To answer one or more pending profile questions (include kgUpdates to write to the KG):
<tool>{"action":"profiling","data":{"answers":[{"id":"pq_marital_status","answer":"married","kgUpdates":{"beliefs":[{"topic":"marital_status","claim":"married","strength":0.9}]}}]}}</tool>

## Rules
- Include tool blocks when the user asks to update the profile or answers a profile question.
- A single response may contain multiple tool blocks.
- Tool blocks are invisible to the user — they see only your prose reply.
- Be concise and conversational.
- When the user asks what is in the profile, summarise the KG state above accurately.
${pendingQuestions.length > 0 ? `- When the user says "update profile", "answer questions", or similar, present the pending profile questions listed above and process their answers via profiling tool blocks. You may answer multiple questions from a single user response.` : ''}
`;
}

/**
 * Parse all <tool>...</tool> blocks from a raw LLM reply.
 * Returns { cleanReply, toolCalls }
 *
 * @param {string} raw
 * @returns {{ cleanReply: string, toolCalls: object[] }}
 */
function parseToolBlocks(raw) {
  const toolCalls = [];
  let cleanReply = raw.replace(TOOL_BLOCK_RE, (_match, inner) => {
    try {
      const parsed = JSON.parse(inner.trim());
      toolCalls.push(parsed);
    } catch {
      // Malformed block — ignore
    }
    return '';
  });
  // Collapse extra whitespace left by removed blocks
  cleanReply = cleanReply.replace(/\n{3,}/g, '\n\n').trim();
  return { cleanReply, toolCalls };
}

/**
 * Handle a chat request against the Marble KG.
 *
 * @param {object} kg - KnowledgeGraph instance
 * @param {{ role: string, content: string }[]} messages - Conversation history
 * @param {{ apiKey: string, baseUrl: string, model: string }} openAiOptions
 * @returns {Promise<{ reply: string, toolCalls: object[] }>}
 */
export async function handleChat(kg, messages, openAiOptions) {
  const { apiKey, baseUrl, model } = openAiOptions;

  const systemPrompt = buildSystemPrompt(kg);

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.7,
    max_completion_tokens: 1024,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';

  const { cleanReply, toolCalls } = parseToolBlocks(raw);
  return { reply: cleanReply, toolCalls };
}
