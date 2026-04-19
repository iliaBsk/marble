/**
 * Cypher Executor
 *
 * Parses and executes a subset of Cypher-like queries against the in-memory Marble KG.
 *
 * Supported statements:
 *   MATCH (n) RETURN n
 *   MATCH (n:Label) RETURN n
 *   MATCH (n:Label {prop: "value"}) RETURN n
 *   CREATE (:Label {prop: value, ...})
 *   MATCH (n:Label {prop: "val"}) SET n.prop = value
 *   MATCH (n:Label {prop: "val"}) DELETE n
 *   SET CONTEXT {key: value, ...}
 */

// ── Label → KG array mapping ──────────────────────────────────────────────────

const LABEL_MAP = {
  interest:   (kg) => kg.user.interests,
  belief:     (kg) => kg.user.beliefs,
  preference: (kg) => kg.user.preferences,
  identity:   (kg) => kg.user.identities,
};

// Primary key field per label (used to match props and display nodes)
const LABEL_KEY = {
  interest:   'topic',
  belief:     'topic',
  preference: 'type',
  identity:   'role',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a properties literal: {key: "val", key2: 0.5}
 * Returns a plain object or null if input is empty/missing.
 */
function parseProps(src) {
  if (!src || !src.trim()) return null;
  // Strip surrounding braces
  const inner = src.trim().replace(/^\{/, '').replace(/\}$/, '').trim();
  if (!inner) return {};

  const result = {};
  // Split on commas not inside quotes
  const parts = splitProps(inner);
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const key = part.slice(0, colonIdx).trim();
    const rawVal = part.slice(colonIdx + 1).trim();
    result[key] = parseValue(rawVal);
  }
  return result;
}

/** Naive comma-split that respects quoted strings */
function splitProps(str) {
  const parts = [];
  let depth = 0;
  let inStr = false;
  let strChar = '';
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; continue; }
    if (inStr && ch === strChar) { inStr = false; continue; }
    if (!inStr && ch === '[') depth++;
    if (!inStr && ch === ']') depth--;
    if (!inStr && depth === 0 && ch === ',') {
      parts.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(str.slice(start).trim());
  return parts.filter(Boolean);
}

function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^["']/.test(raw)) return raw.slice(1, -1);
  const n = Number(raw);
  if (!isNaN(n)) return n;
  return raw;
}

/** Test whether a node matches a props filter */
function nodeMatchesProps(node, props) {
  if (!props) return true;
  for (const [k, v] of Object.entries(props)) {
    const nodeVal = node[k];
    if (typeof nodeVal === 'string' && typeof v === 'string') {
      if (nodeVal.toLowerCase() !== v.toLowerCase()) return false;
    } else if (nodeVal !== v) {
      return false;
    }
  }
  return true;
}

/** Resolve all nodes for a label (or all labels if label is null) */
function resolveNodes(kg, label) {
  if (label) {
    const arr = LABEL_MAP[label.toLowerCase()];
    if (!arr) throw new Error(`Unknown label: ${label}`);
    return arr(kg).map(n => ({ _label: label.toLowerCase(), ...n }));
  }
  // All nodes
  const all = [];
  for (const [lbl, fn] of Object.entries(LABEL_MAP)) {
    for (const n of fn(kg)) {
      all.push({ _label: lbl, ...n });
    }
  }
  return all;
}

// ── Query parsers ─────────────────────────────────────────────────────────────

/**
 * Parse the node pattern: (n), (n:Label), (n:Label {props})
 * Returns { alias, label, props }
 */
function parseNodePattern(src) {
  // Remove outer parens
  const inner = src.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
  // Split alias:Label {props}
  const propsMatch = inner.match(/^(.*?)\s*(\{[\s\S]*\})\s*$/);
  let propsStr = null;
  let rest = inner;
  if (propsMatch) {
    rest = propsMatch[1].trim();
    propsStr = propsMatch[2];
  }
  const colonIdx = rest.indexOf(':');
  let alias = rest;
  let label = null;
  if (colonIdx !== -1) {
    alias = rest.slice(0, colonIdx).trim();
    label = rest.slice(colonIdx + 1).trim();
  }
  const props = parseProps(propsStr);
  return { alias: alias || 'n', label, props };
}

/**
 * Parse SET clause: n.prop = value
 * Returns { prop, value }
 */
function parseSetClause(src) {
  // e.g. "n.weight = 0.9"
  const m = src.trim().match(/^\w+\.(\w+)\s*=\s*(.+)$/);
  if (!m) throw new Error(`Cannot parse SET clause: ${src}`);
  return { prop: m[1], value: parseValue(m[2].trim()) };
}

// ── Main executor ─────────────────────────────────────────────────────────────

/**
 * Execute a Cypher-like query against the Marble KG.
 *
 * @param {object} kg - KnowledgeGraph instance
 * @param {string} query - Cypher-like query string
 * @returns {Promise<{ columns: string[], rows: any[][], summary: string }>}
 */
export async function executeQuery(kg, query) {
  const q = query.trim();
  const upper = q.toUpperCase();

  // ── SET CONTEXT ─────────────────────────────────────────────────────────────
  if (/^SET\s+CONTEXT\s+\{/i.test(q)) {
    const m = q.match(/SET\s+CONTEXT\s+(\{[\s\S]*\})/i);
    if (!m) throw new Error('Cannot parse SET CONTEXT statement');
    const ctx = parseProps(m[1]);
    kg.setContext(ctx);
    await kg.save();
    return { columns: ['result'], rows: [['Context updated']], summary: 'Context updated' };
  }

  // ── CREATE ──────────────────────────────────────────────────────────────────
  if (/^CREATE\s*\(/i.test(q)) {
    const m = q.match(/CREATE\s*(\([^)]*\))/i);
    if (!m) throw new Error('Cannot parse CREATE statement');
    const { label, props } = parseNodePattern(m[1]);
    if (!label) throw new Error('CREATE requires a label, e.g. CREATE (:Interest {...})');
    const lbl = label.toLowerCase();

    if (lbl === 'interest') {
      const topic = props?.topic;
      if (!topic) throw new Error('Interest requires {topic: "..."}');
      kg.boostInterest(topic, props.weight ?? 0.2);
    } else if (lbl === 'belief') {
      const { topic, claim, strength } = props ?? {};
      if (!topic || !claim) throw new Error('Belief requires {topic, claim}');
      kg.addBelief(topic, claim, strength ?? 0.7);
    } else if (lbl === 'preference') {
      const { type, description, strength } = props ?? {};
      if (!type || !description) throw new Error('Preference requires {type, description}');
      kg.addPreference(type, description, strength ?? 0.7);
    } else if (lbl === 'identity') {
      const { role, context, salience } = props ?? {};
      if (!role) throw new Error('Identity requires {role}');
      kg.addIdentity(role, context ?? '', salience ?? 0.8);
    } else {
      throw new Error(`CREATE not supported for label: ${label}`);
    }

    await kg.save();
    const capLabel = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
    return {
      columns: ['result'],
      rows: [[`Created 1 ${capLabel}`]],
      summary: `Created 1 ${capLabel}`,
    };
  }

  // ── MATCH … SET ─────────────────────────────────────────────────────────────
  if (/^MATCH\b/i.test(q) && /\bSET\b/i.test(q)) {
    const m = q.match(/MATCH\s*(\([^)]*\))\s*SET\s+(.+)$/i);
    if (!m) throw new Error('Cannot parse MATCH … SET statement');
    const { label, props: matchProps } = parseNodePattern(m[1]);
    const { prop, value } = parseSetClause(m[2]);

    if (!label) throw new Error('MATCH … SET requires a label');
    const arr = LABEL_MAP[label.toLowerCase()];
    if (!arr) throw new Error(`Unknown label: ${label}`);

    let count = 0;
    for (const node of arr(kg)) {
      if (nodeMatchesProps(node, matchProps)) {
        node[prop] = value;
        count++;
      }
    }
    await kg.save();
    return {
      columns: ['result'],
      rows: [[`Updated ${count} node${count !== 1 ? 's' : ''}`]],
      summary: `Updated ${count} node${count !== 1 ? 's' : ''}`,
    };
  }

  // ── MATCH … DELETE ──────────────────────────────────────────────────────────
  if (/^MATCH\b/i.test(q) && /\bDELETE\b/i.test(q)) {
    const m = q.match(/MATCH\s*(\([^)]*\))\s*DELETE\s+\w+/i);
    if (!m) throw new Error('Cannot parse MATCH … DELETE statement');
    const { label, props: matchProps } = parseNodePattern(m[1]);

    if (!label) throw new Error('MATCH … DELETE requires a label');
    const arr = LABEL_MAP[label.toLowerCase()];
    if (!arr) throw new Error(`Unknown label: ${label}`);

    const before = arr(kg).length;
    const filtered = arr(kg).filter(node => !nodeMatchesProps(node, matchProps));
    const after = filtered.length;

    // Replace in-place on the kg.user object
    const userKey = Object.keys(LABEL_MAP).find(k => LABEL_MAP[k](kg) === arr(kg));
    // Map label string → user property key
    const labelToUserKey = {
      interest:   'interests',
      belief:     'beliefs',
      preference: 'preferences',
      identity:   'identities',
    };
    kg.user[labelToUserKey[label.toLowerCase()]] = filtered;

    const deleted = before - after;
    await kg.save();
    return {
      columns: ['result'],
      rows: [[`Deleted ${deleted} node${deleted !== 1 ? 's' : ''}`]],
      summary: `Deleted ${deleted} node${deleted !== 1 ? 's' : ''}`,
    };
  }

  // ── MATCH … RETURN ──────────────────────────────────────────────────────────
  if (/^MATCH\b/i.test(q) && /\bRETURN\b/i.test(q)) {
    const m = q.match(/MATCH\s*(\([^)]*\))\s*RETURN\s+.+/i);
    if (!m) throw new Error('Cannot parse MATCH … RETURN statement');
    const { label, props: matchProps } = parseNodePattern(m[1]);

    const nodes = resolveNodes(kg, label).filter(n => nodeMatchesProps(n, matchProps));

    if (nodes.length === 0) {
      return { columns: ['n'], rows: [], summary: '0 rows' };
    }

    // Derive columns from first node (excluding internal _label prefix in display)
    const allKeys = new Set();
    for (const n of nodes) {
      for (const k of Object.keys(n)) {
        allKeys.add(k);
      }
    }
    const columns = [...allKeys].filter(k => k !== undefined);
    const rows = nodes.map(n => columns.map(c => n[c] ?? null));

    return { columns, rows, summary: `${nodes.length} row${nodes.length !== 1 ? 's' : ''}` };
  }

  throw new Error(`Unsupported query: ${q.slice(0, 60)}`);
}
