/**
 * Embeddings for Marble
 *
 * Provides semantic embeddings via API providers.
 * Supported providers: openai (default), deepseek
 *
 * Requires OPENAI_API_KEY (or DEEPSEEK_API_KEY for deepseek provider).
 * No local/ONNX fallback — if API call fails, it throws.
 */

/**
 * OpenAI Embeddings provider
 *
 * Uses OpenAI's text-embedding API (text-embedding-3-small by default).
 * Requires OPENAI_API_KEY environment variable.
 *
 * Output dimensions: 1536 (text-embedding-3-small) or 3072 (text-embedding-3-large)
 */
class OpenAIEmbeddings {
  constructor(options = {}) {
    this.apiKey = (options.apiKey !== undefined && options.apiKey !== null) ? options.apiKey : process.env.OPENAI_API_KEY;
    this.model = options.model || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';

    if (!this.apiKey) {
      throw new Error(
        'OpenAI embeddings require OPENAI_API_KEY. ' +
        'Set it in your environment or pass apiKey to the constructor.'
      );
    }
  }

  async embed(text) {
    if (!text || typeof text !== 'string') return new Float32Array(1536);

    const cleanText = text.trim().slice(0, 8191);

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: this.model, input: cleanText })
    });

    if (!response.ok) {
      throw new Error(`OpenAI embeddings API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return new Float32Array(data.data[0].embedding);
  }

  async embedBatch(texts) {
    return Promise.all(texts.map(t => this.embed(t)));
  }

  cosineSimilarity(a, b) {
    if (a.length !== b.length) throw new Error('Embeddings must have same dimensions');
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    return normA === 0 || normB === 0 ? 0 : dot / (normA * normB);
  }

  async findMostSimilar(query, candidates, threshold = 0.3) {
    const queryEmbedding = await this.embed(query);
    const candidateEmbeddings = await this.embedBatch(candidates);

    let bestMatch = { text: null, similarity: -1, index: -1 };

    for (let i = 0; i < candidateEmbeddings.length; i++) {
      const similarity = this.cosineSimilarity(queryEmbedding, candidateEmbeddings[i]);
      if (similarity > bestMatch.similarity && similarity >= threshold) {
        bestMatch = { text: candidates[i], similarity, index: i };
      }
    }

    return bestMatch;
  }

  normalizeVector(vector) {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) vector[i] /= norm;
    }
  }
}

/**
 * DeepSeek Embeddings provider
 *
 * Uses DeepSeek's embeddings API, which is OpenAI-compatible.
 * Requires DEEPSEEK_API_KEY environment variable.
 *
 * Model: deepseek-embedding (1536 dimensions)
 */
class DeepSeekEmbeddings extends OpenAIEmbeddings {
  constructor(options = {}) {
    super({
      apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY,
      model: options.model || process.env.DEEPSEEK_EMBEDDING_MODEL || 'deepseek-embedding',
      baseUrl: options.baseUrl || 'https://api.deepseek.com/v1',
      ...options
    });

    if (!this.apiKey) {
      throw new Error(
        'DeepSeek embeddings require DEEPSEEK_API_KEY. ' +
        'Set it in your environment or pass apiKey to the constructor.'
      );
    }
  }
}

/**
 * Factory: create an embeddings provider based on EMBEDDINGS_PROVIDER env var
 * or the provider option.
 *
 * Supported providers:
 *   openai    — (default) OpenAI text-embedding-3-small, requires OPENAI_API_KEY, 1536 dimensions
 *   deepseek  — DeepSeek embeddings API, requires DEEPSEEK_API_KEY, 1536 dimensions
 *
 * If no OPENAI_API_KEY is set and provider is openai (default), throws a clear error.
 * There is no local/ONNX fallback.
 *
 * @param {Object} options - Options passed to the provider constructor
 * @returns {OpenAIEmbeddings|DeepSeekEmbeddings}
 */
function createEmbeddingsProvider(options = {}) {
  const provider = (options.provider || process.env.EMBEDDINGS_PROVIDER || 'openai').toLowerCase();

  switch (provider) {
    case 'openai':
      return new OpenAIEmbeddings(options);

    case 'deepseek':
      return new DeepSeekEmbeddings(options);

    case 'anthropic':
      throw new Error(
        'Anthropic does not offer an embeddings API. ' +
        'Use EMBEDDINGS_PROVIDER=openai or EMBEDDINGS_PROVIDER=deepseek instead.'
      );

    case 'local':
      throw new Error(
        'Local ONNX embeddings have been removed from Marble. ' +
        'Set OPENAI_API_KEY and use EMBEDDINGS_PROVIDER=openai (default).'
      );

    default:
      throw new Error(
        `Unknown EMBEDDINGS_PROVIDER "${provider}". Supported: "openai", "deepseek".`
      );
  }
}

// Export singleton instance (respects EMBEDDINGS_PROVIDER env var)
export const embeddings = createEmbeddingsProvider();

export { OpenAIEmbeddings, DeepSeekEmbeddings, createEmbeddingsProvider };
