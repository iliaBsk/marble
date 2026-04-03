import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { embeddings, OpenAIEmbeddings, createEmbeddingsProvider } from '../core/embeddings.js';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set — skipping embeddings tests');
  process.exit(0);
}

describe('OpenAI Embeddings', () => {
  it('should generate embeddings for text', async () => {
    const text = 'EU digital markets act compliance requirements';
    const embedding = await embeddings.embed(text);

    assert.ok(embedding instanceof Float32Array, 'Should return Float32Array');
    assert.equal(embedding.length, 1536, 'Should have 1536 dimensions (text-embedding-3-small)');

    // Check that embedding is normalized (L2 norm ≈ 1)
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    assert.ok(Math.abs(norm - 1) < 0.01, 'Embedding should be normalized');
  });

  it('should compute cosine similarity correctly', async () => {
    const text1 = 'digital marketing strategy';
    const text2 = 'online marketing approach';
    const text3 = 'quantum physics research';

    const [emb1, emb2, emb3] = await Promise.all([
      embeddings.embed(text1),
      embeddings.embed(text2),
      embeddings.embed(text3)
    ]);

    const sim1_2 = embeddings.cosineSimilarity(emb1, emb2);
    const sim1_3 = embeddings.cosineSimilarity(emb1, emb3);

    assert.ok(sim1_2 > sim1_3, 'Similar texts should have higher similarity');
    assert.ok(sim1_2 >= -1 && sim1_2 <= 1, 'Similarity should be between -1 and 1');
    assert.ok(sim1_3 >= -1 && sim1_3 <= 1, 'Similarity should be between -1 and 1');
  });

  it('should find most similar text', async () => {
    const query = 'Shopify compliance rules';
    const candidates = [
      'EU digital markets act',
      'Quantum computing breakthrough',
      'E-commerce platform regulations',
      'Space exploration missions'
    ];

    const result = await embeddings.findMostSimilar(query, candidates, 0.1);

    assert.ok(result.text, 'Should find a match');
    assert.ok(result.similarity > 0, 'Should have positive similarity');
    assert.equal(typeof result.index, 'number', 'Should return index');
    console.log('Best match:', result.text, 'similarity:', result.similarity);
  });

  it('should handle batch embedding', async () => {
    const texts = [
      'AI technology trends',
      'Machine learning algorithms',
      'Data science methods'
    ];

    const batch = await embeddings.embedBatch(texts);

    assert.equal(batch.length, texts.length, 'Should return same number of embeddings');
    batch.forEach(emb => {
      assert.ok(emb instanceof Float32Array, 'Each should be Float32Array');
      assert.equal(emb.length, 1536, 'Each should have 1536 dimensions');
    });
  });

  it('should throw without OPENAI_API_KEY', () => {
    assert.throws(
      () => new OpenAIEmbeddings({ apiKey: '' }),
      /OPENAI_API_KEY/,
      'Should throw if no API key'
    );
  });

  it('should throw for removed local provider', () => {
    assert.throws(
      () => createEmbeddingsProvider({ provider: 'local' }),
      /removed/i,
      'Should throw for local provider'
    );
  });
});
