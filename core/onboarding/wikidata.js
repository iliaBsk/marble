/**
 * Wikidata integration for passion → topic entity linking.
 *
 * Layer 1 (sync): static passion → QID map, always runs.
 * Layer 2 (async): SPARQL sub-topic enrichment, fire-and-forget, 5s timeout.
 */

const PASSION_QIDS = {
  'health-fitness': ['Q11019', 'Q8461'],
  'travel':         ['Q61509'],
  'investing':      ['Q172357'],
  'technology':     ['Q11661'],
  'food-lifestyle': ['Q2095'],
  'arts-culture':   ['Q735'],
  'family':         ['Q8054'],
  'sports':         ['Q349'],
};

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

/**
 * Returns static interest nodes for the given passions (no network).
 * @param {string[]} passions
 * @returns {Array<{topic:string,amount:number}>}
 */
export function getTopicInterestsForPassions(passions) {
  const interests = [];
  for (const passion of passions) {
    for (const qid of (PASSION_QIDS[passion] || [])) {
      interests.push({ topic: `wikidata:${qid}`, amount: 0.5 });
    }
  }
  return interests;
}

/**
 * Writes static QID interests then fetches SPARQL sub-topics (fire-and-forget in caller).
 * Swallows all errors — enrichment is always best-effort.
 * @param {import('../kg.js').KnowledgeGraph} kg
 * @param {string[]} passions
 */
const LABELS_API = 'https://www.wikidata.org/w/api.php';

/**
 * Fetch human-readable labels + descriptions for a batch of QIDs.
 * Returns { [qid]: { label, description } }. Silently returns {} on failure.
 * @param {string[]} qids
 * @returns {Promise<Record<string, { label: string, description: string }>>}
 */
async function fetchLabels(qids) {
  if (!qids.length) return {};
  try {
    const url = `${LABELS_API}?action=wbgetentities&ids=${qids.join('|')}&format=json&languages=en&props=labels|descriptions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'MarblePersona/1.0' },
      });
      if (!resp.ok) return {};
      const data = await resp.json();
      const result = {};
      for (const [qid, entity] of Object.entries(data.entities ?? {})) {
        result[qid] = {
          label: entity.labels?.en?.value ?? qid,
          description: entity.descriptions?.en?.value ?? '',
        };
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return {};
  }
}

export async function enrichWithWikidata(kg, passions) {
  for (const interest of getTopicInterestsForPassions(passions)) {
    kg.boostInterest(interest.topic, interest.amount);
  }

  // Ensure label cache exists
  if (!kg.user.wikidataLabels || typeof kg.user.wikidataLabels !== 'object') {
    kg.user.wikidataLabels = {};
  }

  const allQids = [];

  for (const passion of passions) {
    for (const qid of (PASSION_QIDS[passion] || [])) {
      allQids.push(qid);
      try {
        const sparql = `SELECT ?sub WHERE { ?sub wdt:P279* wd:${qid} } LIMIT 15`;
        const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const resp = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json', 'User-Agent': 'MarblePersona/1.0' },
          });
          if (!resp.ok) continue;
          const data = await resp.json();
          for (const binding of (data.results?.bindings || [])) {
            const subQid = binding.sub?.value?.split('/').pop();
            if (subQid && /^Q\d+$/.test(subQid)) {
              kg.boostInterest(`wikidata:${subQid}`, 0.5);
              allQids.push(subQid);
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // silently skip on timeout or network error
      }
    }
  }

  // Batch-fetch labels for all QIDs seen this run (skip already cached)
  const uncached = [...new Set(allQids)].filter(q => !kg.user.wikidataLabels[q]);
  if (uncached.length) {
    const labels = await fetchLabels(uncached);
    Object.assign(kg.user.wikidataLabels, labels);
  }
}
