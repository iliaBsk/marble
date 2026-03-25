/**
 * Local ONNX Embeddings for Prism
 *
 * Provides semantic embeddings using local ONNX models for privacy and speed.
 * Based on sentence-transformers/all-MiniLM-L6-v2 architecture.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class LocalEmbeddings {
  constructor() {
    this.session = null;
    this.tokenizer = null;
    this.maxLength = 512; // MiniLM max sequence length
  }

  async initialize() {
    try {
      // Try to dynamically import ONNX runtime
      const ort = await import('onnxruntime-node');

      // Load the actual MiniLM ONNX model
      const modelPath = path.join(__dirname, '..', 'models', 'all-MiniLM-L6-v2.onnx');
      this.session = await ort.InferenceSession.create(modelPath);

      // Load tokenizer files
      const tokenizerPath = path.join(__dirname, '..', 'models', 'tokenizer.json');
      const tokenizerData = JSON.parse(await readFile(tokenizerPath, 'utf8'));

      const vocabPath = path.join(__dirname, '..', 'models', 'vocab.txt');
      const vocabData = await readFile(vocabPath, 'utf8');

      this.tokenizer = new ONNXTokenizer(tokenizerData, vocabData);
      console.log('✓ Local ONNX embeddings initialized successfully');
    } catch (error) {
      console.warn('Failed to load ONNX model, using fallback embeddings:', error.message);
      this.tokenizer = new SimpleTokenizer();
    }
  }

  /**
   * Generate embedding for a text string
   * @param {string} text - Text to embed
   * @returns {Float32Array} - 384-dimensional embedding vector
   */
  async embed(text) {
    if (!this.tokenizer) {
      await this.initialize();
    }

    // Clean and truncate text
    const cleanText = text.toLowerCase().trim().slice(0, this.maxLength);

    if (this.session && this.tokenizer instanceof ONNXTokenizer) {
      // Use actual ONNX model for inference
      try {
        const ort = await import('onnxruntime-node');
        const tokens = this.tokenizer.tokenize(cleanText);
        const inputTensor = new ort.Tensor('int64', BigInt64Array.from(tokens.map(t => BigInt(t))), [1, tokens.length]);
        const attentionMask = new ort.Tensor('int64', BigInt64Array.from(tokens.map(() => BigInt(1))), [1, tokens.length]);

        const feeds = {
          input_ids: inputTensor,
          attention_mask: attentionMask
        };

        const results = await this.session.run(feeds);
        const embeddings = results.last_hidden_state.data;

        // Mean pooling (average across sequence length)
        const sequenceLength = tokens.length;
        const hiddenSize = 384;
        const pooled = new Float32Array(hiddenSize);

        for (let i = 0; i < hiddenSize; i++) {
          let sum = 0;
          for (let j = 0; j < sequenceLength; j++) {
            sum += embeddings[j * hiddenSize + i];
          }
          pooled[i] = sum / sequenceLength;
        }

        // Normalize the embedding
        this.normalizeVector(pooled);
        return pooled;
      } catch (error) {
        console.warn('ONNX inference failed, using fallback:', error.message);
        // Fall through to fallback implementation
      }
    }

    // Fallback to simple tokenizer
    return this.tokenizer.encode(cleanText);
  }

  /**
   * Generate embeddings for multiple texts in batch
   * @param {string[]} texts - Array of texts to embed
   * @returns {Float32Array[]} - Array of embedding vectors
   */
  async embedBatch(texts) {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param {Float32Array} a - First embedding
   * @param {Float32Array} b - Second embedding
   * @returns {number} - Similarity score between -1 and 1
   */
  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Find the most similar text from a list
   * @param {string} query - Query text
   * @param {string[]} candidates - Candidate texts
   * @param {number} threshold - Minimum similarity threshold
   * @returns {Object} - {text, similarity, index}
   */
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

  /**
   * Normalize a vector to unit length
   * @param {Float32Array} vector - Vector to normalize
   */
  normalizeVector(vector) {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
  }
}

/**
 * ONNX-compatible tokenizer for BERT/MiniLM models
 * Handles proper BERT tokenization with special tokens
 */
class ONNXTokenizer {
  constructor(tokenizerConfig, vocabData) {
    this.tokenizerConfig = tokenizerConfig;
    this.vocab = new Map();
    this.reverseVocab = new Map();

    // Parse vocabulary
    const vocabLines = vocabData.trim().split('\n');
    vocabLines.forEach((word, index) => {
      this.vocab.set(word, index);
      this.reverseVocab.set(index, word);
    });

    // Special tokens
    this.clsToken = 101;  // [CLS]
    this.sepToken = 102;  // [SEP]
    this.padToken = 0;    // [PAD]
    this.unkToken = 100;  // [UNK]

    this.maxLength = 512;
  }

  /**
   * Basic wordpiece tokenization
   * @param {string} text - Text to tokenize
   * @returns {number[]} - Token IDs
   */
  tokenize(text) {
    const tokens = [this.clsToken]; // Start with [CLS] token

    // Basic whitespace and punctuation splitting
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

    for (const word of words) {
      // Simple word-to-token mapping (basic subword handling)
      const wordTokens = this.encodeWord(word);
      tokens.push(...wordTokens);

      // Check max length (leaving room for [SEP] token)
      if (tokens.length >= this.maxLength - 1) break;
    }

    tokens.push(this.sepToken); // End with [SEP] token

    // Pad to consistent length (optional, for batching)
    while (tokens.length < Math.min(128, this.maxLength)) {
      tokens.push(this.padToken);
    }

    return tokens;
  }

  /**
   * Encode a single word into token IDs
   * @param {string} word - Word to encode
   * @returns {number[]} - Token IDs for the word
   */
  encodeWord(word) {
    // Try exact match first
    if (this.vocab.has(word)) {
      return [this.vocab.get(word)];
    }

    // Basic subword fallback - split into characters if word not found
    const tokens = [];
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (this.vocab.has(char)) {
        tokens.push(this.vocab.get(char));
      } else {
        tokens.push(this.unkToken);
      }

      // Limit subword tokens per word
      if (tokens.length >= 8) break;
    }

    return tokens.length > 0 ? tokens : [this.unkToken];
  }
}

/**
 * Simple fallback tokenizer that creates basic semantic vectors
 * This would be replaced by proper ONNX model tokenization in production
 */
class SimpleTokenizer {
  constructor() {
    // Common semantic keywords for scoring
    this.vocabulary = new Map();
    this.embeddingSize = 384; // MiniLM-L6-v2 embedding dimension
    this.buildVocabulary();
  }

  buildVocabulary() {
    // Build a simple vocabulary with semantic clusters
    const categories = {
      tech: ['technology', 'ai', 'software', 'algorithm', 'data', 'digital', 'cyber', 'tech', 'innovation'],
      business: ['business', 'company', 'market', 'revenue', 'profit', 'startup', 'enterprise', 'commerce'],
      development: ['development', 'programming', 'code', 'coding', 'build', 'deploy', 'api', 'framework'],
      compliance: ['compliance', 'regulation', 'legal', 'privacy', 'gdpr', 'security', 'audit', 'rules'],
      finance: ['finance', 'investment', 'funding', 'money', 'capital', 'financial', 'bank', 'payment'],
      product: ['product', 'feature', 'launch', 'release', 'update', 'version', 'platform', 'service']
    };

    let index = 0;
    for (const [category, words] of Object.entries(categories)) {
      for (const word of words) {
        this.vocabulary.set(word, index++);
      }
    }
  }

  encode(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    // Create embedding vector
    const embedding = new Float32Array(this.embeddingSize);

    // Simple bag-of-words with TF-IDF-like weighting
    const wordCounts = new Map();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Fill embedding dimensions based on word presence and frequency
    for (const [word, count] of wordCounts) {
      const vocabIndex = this.vocabulary.get(word);
      if (vocabIndex !== undefined && vocabIndex < this.embeddingSize) {
        // Use log frequency to avoid dominance by common words
        embedding[vocabIndex] = Math.log(1 + count);
      }

      // Add some randomness for unknown words to create unique signatures
      const hash = this.simpleHash(word) % this.embeddingSize;
      embedding[hash] += 0.1;
    }

    // Normalize the vector
    this.normalize(embedding);
    return embedding;
  }

  normalize(vector) {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Export singleton instance
export const embeddings = new LocalEmbeddings();

export { LocalEmbeddings };