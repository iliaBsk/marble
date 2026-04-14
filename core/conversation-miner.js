/**
 * conversation-miner.js — Ingest chat exports into KG nodes.
 *
 * Reads raw chat JSON (ChatGPT export format or Claude format), chunks by
 * message, sends each user-turn chunk to an LLM with an extraction prompt,
 * and returns an array of KG nodes (type, value, confidence).
 *
 * Usage:
 *   import { ConversationMiner } from './conversation-miner.js';
 *   const miner = new ConversationMiner(llmCall);
 *   const nodes = await miner.ingest('/path/to/export.json');
 *
 * Pluggable as a registerDataSource() adapter:
 *   loop.registerDataSource('chat_export', async (query) => {
 *     const nodes = await miner.ingest('./export.json');
 *     return nodes
 *       .filter(n => n.value.toLowerCase().includes(query.toLowerCase()))
 *       .map(n => `[${n.type}] ${n.value} (confidence: ${n.confidence})`);
 *   });
 *
 * Supported export formats:
 *   ChatGPT: { conversations: [{ title, mapping: { [id]: { message: { role, content: { parts } } } } }] }
 *   Claude:  { conversations: [{ name, chat_messages: [{ sender, text }] }] }
 *   Generic: [{ role, content }] or { messages: [{ role, content }] }
 *
 * No external dependencies beyond the LLM call.
 */

import { readFile } from 'fs/promises';

// ─── EXTRACTION PROMPT ────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a knowledge graph extraction engine. Analyze the following chat messages from a user and extract structured nodes about the user.

Extract nodes of these types:
- belief: Core beliefs, opinions, or worldviews the user expressed
- preference: Explicit likes, dislikes, or preferences the user mentioned
- identity: Roles, professions, identities, or self-descriptions the user gave

Return ONLY a valid JSON array of node objects with this exact shape:
[
  { "type": "belief"|"preference"|"identity", "value": "concise factual statement about user", "confidence": 0.0-1.0, "topic": "category" }
]

Rules:
- Only extract nodes clearly supported by what the user said (not the assistant)
- Use third-person phrasing about the user (e.g. "User believes...", "User prefers...", "User identifies as...")
- Confidence: 0.9 = explicit statement, 0.7 = strong implication, 0.5 = reasonable inference
- Return [] if no clear nodes can be extracted
- Do not include assistant statements as user beliefs
- Minimum 1-sentence value that would be useful in a knowledge graph

Chat messages:
`;

const EXCHANGE_EXTRACTION_PROMPT = `You are a deep knowledge graph extraction engine. Analyze the following user-assistant exchange pair and extract structured nodes about the user.

For each exchange, consider:
1. What the user explicitly asked or stated
2. What the user's question/request reveals about their situation, goals, knowledge level
3. What emotional signals are present in the user's language

Extract nodes of these types:
- belief: Core beliefs, opinions, or worldviews the user expressed
- preference: Explicit likes, dislikes, or preferences the user mentioned
- identity: Roles, professions, identities, or self-descriptions the user gave
- decision: Choices or decisions the user made or is considering
- emotion: Emotional states detected in the user's messages

Return ONLY a valid JSON array of node objects with this exact shape:
[
  { "type": "belief"|"preference"|"identity"|"decision"|"emotion", "value": "concise factual statement about user", "confidence": 0.0-1.0, "topic": "category", "emotions": ["joy"|"fear"|"trust"|"frustration"|"hope"|"anxiety"|"pride"|"shame"|"curiosity"|"boredom"|"anger"|"love"|"grief"|"wonder"|"peace"] }
]

The "emotions" array should contain detected emotions in the user's messages for THIS exchange.
Return [] if no clear nodes can be extracted.

Exchange:
`;

// ─── FORMAT PARSERS ───────────────────────────────────────────────────────────

/**
 * Parse ChatGPT export format.
 * ChatGPT exports: { conversations: [{ mapping: { [id]: { message: { role, content: { parts } } } } }] }
 */
function parseChatGPTFormat(data) {
  const conversations = data.conversations || (Array.isArray(data) ? data : [data]);
  const chunks = [];

  for (const conv of conversations) {
    const messages = [];

    if (conv.mapping) {
      // ChatGPT mapping format: tree structure
      for (const node of Object.values(conv.mapping)) {
        const msg = node.message;
        if (!msg || !msg.role || msg.role === 'system') continue;

        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (msg.content?.parts) {
          text = msg.content.parts.filter(p => typeof p === 'string').join('\n');
        }

        if (text.trim()) {
          messages.push({ role: msg.role, content: text.trim() });
        }
      }
    } else if (conv.chat_messages) {
      // Claude export format: { chat_messages: [{ sender, text }] }
      for (const msg of conv.chat_messages) {
        const role = msg.sender === 'human' ? 'user' : 'assistant';
        const text = msg.text || msg.content || '';
        if (text.trim()) {
          messages.push({ role, content: text.trim() });
        }
      }
    } else if (Array.isArray(conv.messages)) {
      // Generic: { messages: [{ role, content }] }
      for (const msg of conv.messages) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: String(msg.content).trim() });
        }
      }
    }

    if (messages.length > 0) {
      chunks.push(messages);
    }
  }

  return chunks;
}

/**
 * Parse any supported chat export format into an array of message-chunk arrays.
 * Each chunk is [{ role, content }].
 */
function parseExport(data) {
  // Already an array of messages (flat format)
  if (Array.isArray(data) && data[0]?.role) {
    return [data];
  }

  // Has conversations key → ChatGPT or Claude bulk export
  if (data.conversations || (Array.isArray(data) && data[0]?.mapping)) {
    return parseChatGPTFormat(data);
  }

  // Single conversation with chat_messages (Claude single-convo export)
  if (data.chat_messages) {
    return parseChatGPTFormat({ conversations: [data] });
  }

  // Single conversation with mapping (ChatGPT single-convo)
  if (data.mapping) {
    return parseChatGPTFormat({ conversations: [data] });
  }

  // Generic single conversation
  if (Array.isArray(data.messages)) {
    return [data.messages];
  }

  return [];
}

// ─── CHUNK BUILDER ────────────────────────────────────────────────────────────

/**
 * Group messages into chunks for LLM extraction.
 * Each chunk contains up to maxMessages turns to stay within token limits.
 */
function buildChunks(messages, maxMessages = 20) {
  const userMessages = messages.filter(m => m.role === 'user');
  const chunks = [];

  for (let i = 0; i < userMessages.length; i += maxMessages) {
    chunks.push(userMessages.slice(i, i + maxMessages));
  }

  return chunks;
}

/**
 * Build exchange pairs: user message paired with the assistant's response.
 * Each exchange provides richer context than isolated user messages.
 * Filters out trivially short exchanges (< 30 chars combined).
 */
function buildExchangePairs(messages) {
  const exchanges = [];

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      const userMsg = messages[i];
      // Find the next assistant message
      const assistantMsg = (i + 1 < messages.length && messages[i + 1].role === 'assistant')
        ? messages[i + 1]
        : null;

      const combined = (userMsg.content || '') + (assistantMsg?.content || '');
      if (combined.length >= 30) {
        exchanges.push({ user: userMsg.content, assistant: assistantMsg?.content || '' });
      }
    }
  }

  return exchanges;
}

/**
 * Format a chunk of messages into a text block for the extraction prompt.
 */
function formatChunk(messages) {
  return messages
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n');
}

// ─── RESPONSE PARSER ──────────────────────────────────────────────────────────

/**
 * Parse LLM response to extract JSON array of KG nodes.
 * Handles cases where the LLM wraps JSON in markdown code blocks.
 */
function parseNodes(responseText) {
  let text = responseText.trim();

  // Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  // Find the JSON array
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  try {
    const nodes = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(nodes) ? nodes : [];
  } catch {
    return [];
  }
}

/**
 * Validate and normalize a KG node.
 * Returns null if invalid.
 */
function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const type = String(raw.type || '').toLowerCase();
  if (!['belief', 'preference', 'identity', 'decision', 'emotion'].includes(type)) return null;

  const value = String(raw.value || '').trim();
  if (!value) return null;

  const confidence = Math.max(0, Math.min(1, parseFloat(raw.confidence) || 0.5));
  const topic = String(raw.topic || type).trim();
  const emotions = Array.isArray(raw.emotions) ? raw.emotions.filter(e => typeof e === 'string') : [];

  return { type, value, confidence, topic, emotions };
}

// ─── CONVERSATION MINER ───────────────────────────────────────────────────────

export class ConversationMiner {
  /**
   * @param {Function} llmCall - async (prompt: string) => string
   *   Must return the LLM's text response.
   * @param {Object} [opts]
   * @param {number} [opts.chunkSize=20]   - Max user messages per LLM call
   * @param {number} [opts.maxChunks=10]   - Max chunks to process per export
   */
  constructor(llmCall, opts = {}) {
    this.llmCall = llmCall;
    this.chunkSize = opts.chunkSize || 20;
    this.maxChunks = opts.maxChunks || 10;
  }

  /**
   * Ingest a chat export file and return KG nodes extracted from it.
   *
   * @param {string} chatExportPath - Absolute or relative path to export JSON
   * @returns {Promise<Array<{ type: string, value: string, confidence: number, topic: string }>>}
   */
  async ingest(chatExportPath) {
    const raw = await readFile(chatExportPath, 'utf-8');
    const data = JSON.parse(raw);
    const conversations = parseExport(data);

    if (conversations.length === 0) {
      throw new Error(`[ConversationMiner] No parseable conversations found in ${chatExportPath}`);
    }

    const allNodes = [];
    let chunksProcessed = 0;

    for (const messages of conversations) {
      if (chunksProcessed >= this.maxChunks) break;

      const chunks = buildChunks(messages, this.chunkSize);

      for (const chunk of chunks) {
        if (chunksProcessed >= this.maxChunks) break;
        if (chunk.length === 0) continue;

        const prompt = EXTRACTION_PROMPT + formatChunk(chunk);

        let responseText;
        try {
          responseText = await this.llmCall(prompt);
        } catch (err) {
          console.warn(`[ConversationMiner] LLM call failed for chunk ${chunksProcessed}: ${err.message}`);
          continue;
        }

        const rawNodes = parseNodes(responseText);
        for (const raw of rawNodes) {
          const node = normalizeNode(raw);
          if (node) allNodes.push(node);
        }

        chunksProcessed++;
      }
    }

    return allNodes;
  }

  /**
   * Ingest a chat export using exchange-mode: pair user messages with assistant
   * responses for richer context extraction. Also detects emotions.
   *
   * @param {string} chatExportPath - Path to export JSON
   * @returns {Promise<Array<{ type: string, value: string, confidence: number, topic: string, emotions: string[] }>>}
   */
  async ingestExchanges(chatExportPath) {
    const raw = await readFile(chatExportPath, 'utf-8');
    const data = JSON.parse(raw);
    const conversations = parseExport(data);

    if (conversations.length === 0) {
      throw new Error(`[ConversationMiner] No parseable conversations found in ${chatExportPath}`);
    }

    const allNodes = [];
    let exchangesProcessed = 0;

    for (const messages of conversations) {
      const exchanges = buildExchangePairs(messages);

      for (const exchange of exchanges) {
        if (exchangesProcessed >= this.maxChunks * this.chunkSize) break;

        const text = `[USER]: ${exchange.user}\n\n[ASSISTANT]: ${exchange.assistant}`;
        const prompt = EXCHANGE_EXTRACTION_PROMPT + text;

        let responseText;
        try {
          responseText = await this.llmCall(prompt);
        } catch (err) {
          console.warn(`[ConversationMiner] LLM call failed for exchange ${exchangesProcessed}: ${err.message}`);
          continue;
        }

        const rawNodes = parseNodes(responseText);
        for (const raw of rawNodes) {
          const node = normalizeNode(raw);
          if (node) allNodes.push(node);
        }

        exchangesProcessed++;
      }
    }

    return allNodes;
  }

  /**
   * Ingest a chat export and write extracted nodes directly into a KG.
   * Handles type mapping: belief → addBelief, preference → addPreference,
   * identity → addIdentity, decision → addBelief (as decision type),
   * emotion → tagEmotions.
   *
   * @param {string} chatExportPath - Path to export JSON
   * @param {import('./kg.js').KnowledgeGraph} kg - Target knowledge graph
   * @param {Object} [opts]
   * @param {boolean} [opts.exchangeMode=true] - Use exchange-mode for richer extraction
   * @returns {Promise<{ ingested: number, beliefs: number, preferences: number, identities: number, emotions: number }>}
   */
  async ingestIntoKG(chatExportPath, kg, opts = {}) {
    const useExchanges = opts.exchangeMode !== false;
    const nodes = useExchanges
      ? await this.ingestExchanges(chatExportPath)
      : await this.ingest(chatExportPath);

    const stats = { ingested: 0, beliefs: 0, preferences: 0, identities: 0, emotions: 0 };

    for (const node of nodes) {
      try {
        if (node.type === 'belief' || node.type === 'decision') {
          kg.addBelief(node.topic, node.value, node.confidence);
          stats.beliefs++;
        } else if (node.type === 'preference') {
          kg.addPreference(node.topic, node.value, node.confidence);
          stats.preferences++;
        } else if (node.type === 'identity') {
          kg.addIdentity(node.topic, node.value, node.confidence);
          stats.identities++;
        }

        // Tag emotions if present
        if (node.emotions?.length && typeof kg.tagEmotions === 'function') {
          const kgType = (node.type === 'decision') ? 'belief' : node.type;
          if (['belief', 'preference', 'identity'].includes(kgType)) {
            kg.tagEmotions(kgType, node.topic, node.emotions);
            stats.emotions += node.emotions.length;
          }
        }

        stats.ingested++;
      } catch {
        // non-fatal: skip nodes that fail to ingest
      }
    }

    return stats;
  }

  /**
   * Build a registerDataSource()-compatible search function.
   *
   * Usage:
   *   loop.registerDataSource('my_chat', miner.asDataSource('./export.json'));
   *
   * @param {string} chatExportPath
   * @returns {Function} async (query: string) => string[]
   */
  asDataSource(chatExportPath) {
    let cachedNodes = null;

    return async (query) => {
      if (!cachedNodes) {
        cachedNodes = await this.ingest(chatExportPath);
      }

      const q = query.toLowerCase();
      return cachedNodes
        .filter(n => n.value.toLowerCase().includes(q) || n.topic.toLowerCase().includes(q))
        .map(n => `[${n.type}|${n.topic}] ${n.value} (confidence: ${n.confidence})`);
    };
  }
}
