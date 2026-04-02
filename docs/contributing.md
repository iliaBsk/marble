# Contributing to Marble

## Development Setup

1. **Prerequisites**
   ```bash
   node --version  # 18+
   npm --version   # 8+
   ```

2. **Install Dependencies**
   ```bash
   cd jarvis-dashboard/core/marble
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Add your OpenAI API key for embeddings
   ```

4. **Run Tests**
   ```bash
   npm test
   # or run specific tests
   node test-kg.js
   node test-scorer.js
   ```

## Code Style

### JavaScript Standards
- ES6+ modules (import/export)
- JSDoc comments for public methods
- Async/await over Promises
- Destructuring where readable
- No semicolons (standard.js style)

### Example Function
```javascript
/**
 * Score stories against user knowledge graph
 * @param {Story[]} stories - Array of story objects
 * @returns {Promise<ScoredStory[]>} - Stories with scores, sorted descending
 */
async score(stories) {
  const scored = await Promise.all(stories.map(story => this.#scoreOne(story)))
  return scored.sort((a, b) => b.magic_score - a.magic_score)
}
```

### File Organization
- One class per file
- Private methods prefixed with `#`
- Constants in UPPER_CASE
- Imports at top, exports at bottom

## Testing Guidelines

### Unit Tests
Each component should have comprehensive tests:

```javascript
// test-kg.js example
import { KnowledgeGraph } from './kg.js'

async function testInterestDecay() {
  const kg = new KnowledgeGraph(':memory:')
  await kg.load()

  // Test decay calculation
  kg.boostInterest('ai', 0.5)
  const initialWeight = kg.getInterestWeight('ai')

  // Mock time passing
  kg.user.interests[0].last_boost = '2020-01-01'
  const decayedWeight = kg.getInterestWeight('ai')

  console.assert(decayedWeight < initialWeight, 'Interest should decay over time')
}
```

### Integration Tests
Test full scoring pipeline:

```javascript
async function testFullPipeline() {
  const kg = new KnowledgeGraph(':memory:')
  await kg.load()

  // Set up user interests
  kg.boostInterest('artificial-intelligence', 0.8)
  kg.setContext({ active_projects: ['ai-research'] })

  // Test story
  const story = {
    id: 'test-1',
    title: 'AI Breakthrough in Natural Language',
    topics: ['artificial-intelligence', 'research'],
    source: 'arxiv',
    published_at: new Date()
  }

  // Score and validate
  const scorer = new Scorer(kg)
  const [scored] = await scorer.score([story])

  console.assert(scored.magic_score > 0.5, 'Should score highly for matching interests')
}
```

## Pull Request Process

1. **Branch Naming**
   ```
   feature/temporal-scoring-improvements
   fix/embeddings-cache-bug
   docs/api-reference-updates
   ```

2. **Commit Messages**
   ```
   feat: add temporal context weighting to scorer
   fix: resolve embeddings cache collision
   docs: update API reference with new methods
   test: add integration tests for full pipeline
   ```

3. **PR Template**
   ```markdown
   ## What Changed
   Brief description of the changes

   ## Why
   Motivation and context

   ## Testing
   - [ ] Unit tests pass
   - [ ] Integration tests pass
   - [ ] Manual testing completed

   ## Performance Impact
   Any performance implications
   ```

## Architecture Decisions

When making changes, consider:

### 1. Backward Compatibility
- User models must remain loadable
- API changes require versioning
- Scoring algorithm changes need migration path

### 2. Performance Impact
- Scoring must remain under 500ms for 1000 stories
- Memory usage should not exceed 100MB per user
- Embeddings cache must be efficient

### 3. Explainability
- New scoring factors need human-readable explanations
- Debug mode should provide insight into decisions
- User trust requires transparency

## Common Contributions

### Adding New Scoring Dimensions

1. **Add to types.js**
   ```javascript
   export const SCORE_WEIGHTS = {
     // existing weights...
     social_signals: 0.05  // new dimension
   }
   ```

2. **Implement in scorer.js**
   ```javascript
   #socialSignals(story) {
     // Calculate social media engagement, comments, shares
     return story.social_engagement_score || 0
   }
   ```

3. **Update scoring calculation**
   ```javascript
   const social = this.#socialSignals(story)
   const raw = (
     // existing calculations...
     social * SCORE_WEIGHTS.social_signals
   )
   ```

4. **Add tests**
   ```javascript
   async function testSocialSignals() {
     // Test the new dimension
   }
   ```

### Improving Interest Modeling

User interest evolution is complex. Consider:
- Long-term vs short-term preferences
- Seasonal/cyclical interests
- Interest drift detection
- Cross-topic relationships

### Optimizing Performance

Common optimization areas:
- Embeddings computation caching
- User model loading efficiency
- Scoring algorithm vectorization
- Memory usage reduction

## Bug Reports

Include:
1. **Environment details** (Node version, OS)
2. **Minimal reproduction case**
3. **Expected vs actual behavior**
4. **Error messages and stack traces**
5. **User model state** (sanitized)

## Feature Requests

Consider:
1. **Use case description** - Why is this needed?
2. **Performance implications** - Impact on scoring speed
3. **Backward compatibility** - Effect on existing users
4. **Implementation complexity** - Rough development estimate

## Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests cover new functionality
- [ ] Documentation updated
- [ ] Performance impact measured
- [ ] Backward compatibility maintained
- [ ] Security implications considered

---

Thanks for contributing to Marble! Your improvements help create better personalized experiences for everyone.