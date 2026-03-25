# Contributing to Marble

## Getting Started

```bash
git clone https://github.com/AlexShrestha/prism.git
cd prism
npm install
npm test
```

## Project Structure

- `core/` — The engine. All scoring, KG, evolution, and simulation logic lives here.
- `adapters/` — Source ingestion, delivery channels, and signal collection.
- `worldsim/` — Population-level PMF simulation.
- `web/` — Web reader and signal tracker.
- `api/` — REST API server.
- `test/` — Test harness with 30 realistic stories.
- `docs/` — Documentation.

## Development

### Running Tests

```bash
npm test              # Full test harness
node test/run.js      # Score vs Swarm comparison with 30 stories
```

### Adding a Source Adapter

Create a new file in `adapters/sources/`. Follow the pattern in `rss.js`:

```javascript
export class YourSourceAdapter {
  constructor(config) { /* ... */ }
  async fetchStories(options) {
    // Return array of Story objects:
    // { id, title, summary, source, url, topics, published_at }
  }
}
```

### Adding a Delivery Adapter

Create a new file in `adapters/delivery/`. Follow the pattern in `telegram.js`:

```javascript
export class YourDeliveryAdapter {
  constructor(config) { /* ... */ }
  async sendStories(stories, destination, options) { /* ... */ }
}
```

### Modifying the KG

The KG (`core/kg.js`) is the most sensitive module. Changes here affect everything downstream. If you modify the insight structure, ensure:

1. v1 → v2 migration still works
2. `getInterests()` backward compatibility is maintained
3. New insights include proper `source_layer` tags
4. Confidence values stay in 0-1 range

### Adding a Swarm Agent

Agents are defined in `core/swarm.js`. To add a sixth agent:

1. Add the agent definition with a weight (total must sum to 1.0)
2. Implement the scoring function
3. Add relationship-awareness if relevant
4. Update tests

## Code Style

- ES modules (`import`/`export`)
- No TypeScript (plain JS with JSDoc where helpful)
- Async/await for all IO
- No external API calls in `core/` (local-first)
- Keep modules independently testable

## Pull Requests

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `npm test`
5. Submit a PR with a clear description of what and why

## Documentation

**Always update docs alongside code changes.** If you modify a module's API, update the corresponding docs file. If you add a new feature, add a section to the relevant doc.

## Questions?

Open an issue on GitHub or check existing issues for context.
