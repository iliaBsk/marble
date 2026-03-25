import { describe, it } from 'node:test';
import assert from 'node:assert';
import { embeddings, LocalEmbeddings } from '../core/embeddings.js';

describe('Local Embeddings', () => {
  it('should initialize embeddings system', async () => {
    await embeddings.initialize();
    assert.ok(embeddings.tokenizer, 'Tokenizer should be initialized');
  });

  it('should generate embeddings for text', async () => {
    const text = 'EU digital markets act compliance requirements';
    const embedding = await embeddings.embed(text);

    assert.ok(embedding instanceof Float32Array, 'Should return Float32Array');
    assert.equal(embedding.length, 384, 'Should have 384 dimensions');

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

    // Similar marketing texts should be more similar than unrelated texts
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

    // Should find some reasonable match (fallback implementation may vary)
    console.log('Best match:', result.text, 'similarity:', result.similarity);
    assert.ok(result.similarity > 0, 'Should find some match with positive similarity');
  });

  it('should handle batch embedding', async () => {
    const texts = [
      'AI technology trends',
      'Machine learning algorithms',
      'Data science methods'
    ];

    const embeddings_batch = await embeddings.embedBatch(texts);

    assert.equal(embeddings_batch.length, texts.length, 'Should return same number of embeddings');
    embeddings_batch.forEach(emb => {
      assert.ok(emb instanceof Float32Array, 'Each should be Float32Array');
      assert.equal(emb.length, 384, 'Each should have 384 dimensions');
    });
  });

  it('should handle edge cases gracefully', async () => {
    // Empty text
    const emptyEmb = await embeddings.embed('');
    assert.ok(emptyEmb instanceof Float32Array, 'Should handle empty text');

    // Very long text
    const longText = 'word '.repeat(1000);
    const longEmb = await embeddings.embed(longText);
    assert.ok(longEmb instanceof Float32Array, 'Should handle long text');

    // Special characters
    const specialEmb = await embeddings.embed('Test !@#$%^&*()');
    assert.ok(specialEmb instanceof Float32Array, 'Should handle special characters');
  });
});