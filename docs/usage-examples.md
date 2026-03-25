# Usage Examples

Real code showing how to plug Marble into your app.

## 1. Newsletter Platform

Personalize which articles each subscriber gets.

```javascript
import { Marble } from 'marblism';
import { RSSAdapter } from 'marblism/adapters/sources/rss.js';
import { EmailAdapter } from 'marblism/adapters/delivery/email.js';

// One Marble instance per user (or shared with per-user KG paths)
const marble = new Marble({
  dataPath: `./data/users/${userId}-kg.json`,
  count: 10,
  mode: 'score'
});
await marble.init();

// Fetch stories from your sources
const rss = new RSSAdapter({
  feeds: [
    'https://feeds.feedburner.com/techcrunch/HKDS',
    'https://rss.cnn.com/rss/edition.rss'
  ]
});
const stories = await rss.fetchStories({ limit: 50 });

// Select top 10 for this user
const personalized = await marble.select(stories, {
  calendar: ['team standup 10:00', 'client call 14:00'],
  active_projects: ['API redesign'],
  recent_conversations: ['migration timeline']
});

// Send via email
const email = new EmailAdapter({
  baseUrl: 'https://yourapp.com',
  fromEmail: 'digest@yourapp.com'
});

await email.sendNewsletterEmail(personalized, subscriber.email, {
  subject: 'Your Morning Digest',
  userId: subscriber.id
});

// Later: track engagement and save
await marble.react('story-123', 'up', ['api', 'migration']);
await marble.save();
```

## 2. SaaS Notification Prioritization

Rank notifications by relevance instead of chronological order.

```javascript
import { Marble } from 'marblism';

const marble = new Marble({
  dataPath: `./data/${userId}-kg.json`,
  count: 5
});
await marble.init();

// Convert your notifications into Story format
const notifications = userNotifications.map(n => ({
  id: n.id,
  title: n.title,
  summary: n.body,
  source: n.type,           // 'alert', 'update', 'mention', etc.
  topics: n.tags,
  published_at: n.createdAt
}));

// Get top 5 most relevant right now
const prioritized = await marble.select(notifications, {
  active_projects: user.currentProjects,
  calendar: user.todayEvents
});

// Show prioritized list
prioritized.forEach(n => {
  console.log(`[${n.magic_score.toFixed(2)}] ${n.story.title}`);
  console.log(`  Why: ${n.why}`);
});
```

## 3. Content Feed with Implicit Learning

No thumbs up/down — learn from behavior.

```javascript
import { Marble, SignalProcessor } from 'marblism';

const marble = new Marble({ mode: 'score' });
await marble.init();

const signals = new SignalProcessor();

// Track user behavior on your frontend
function onArticleView(articleId, dwellMs) {
  signals.recordSignal(articleId, 'dwell', dwellMs);
}

function onArticleScroll(articleId, depth) {
  signals.recordSignal(articleId, 'scroll', { depth }); // 0-1
}

function onArticleShare(articleId) {
  signals.recordSignal(articleId, 'forward', 1);
}

// Periodically convert signals to reactions
setInterval(async () => {
  const reactions = signals.inferReactions();
  for (const { storyId, reaction, confidence } of reactions) {
    if (confidence > 0.5) {
      await marble.react(storyId, reaction);
    }
  }
  await marble.save();
}, 60000); // Every minute
```

## 4. Product-Market Fit Testing

Test your product idea against synthetic users before building.

```javascript
import { WorldSim } from 'marblism/worldsim';

const worldsim = new WorldSim({ verbose: true });

const product = {
  name: 'DevFlow',
  description: 'AI-powered code review for small teams. Catches bugs, suggests improvements, learns your codebase style.',
  categories: ['developer-tools', 'productivity', 'AI'],
  target_audience: 'software engineers at startups'
};

// Quick check (20 archetypes, fast)
const quick = await worldsim.quickCheck(product);
console.log(`Quick PMF: ${quick.pmf_score}`);

// Full simulation (50 archetypes)
const results = await worldsim.simulate(product);

console.log(`PMF Score: ${results.pmf_score}/1.0`);
console.log(`Confidence: ${results.confidence}`);
console.log(`\nTop segments:`);
results.segments.forEach(s => {
  console.log(`  ${s.name}: ${s.avgScore.toFixed(2)} (${s.viability})`);
});

console.log(`\nRecommended messaging:`);
Object.entries(results.messaging).forEach(([seg, msg]) => {
  console.log(`  ${seg}: ${msg.positioning}`);
});
```

## 5. Multi-Channel Delivery

Send the same personalized selection through multiple channels.

```javascript
import { Marble } from 'marblism';
import { TelegramAdapter } from 'marblism/adapters/delivery/telegram.js';
import { WebhookAdapter } from 'marblism/adapters/delivery/webhook.js';

const marble = new Marble({ mode: 'swarm', llm: yourLLM });
await marble.init();

const stories = await marble.select(allStories);

// Telegram
const tg = new TelegramAdapter(process.env.TELEGRAM_TOKEN, 'https://yourapp.com');
await tg.sendStories(stories, chatId, { format: 'compact', includeReactions: true });

// Slack webhook
const webhook = new WebhookAdapter();
await webhook.deliverToWebhooks(stories, [{
  name: 'team-slack',
  url: process.env.SLACK_WEBHOOK,
  payloadFormat: 'slack',
  format: 'summary'
}]);
```

## 6. Swarm Mode with Custom LLM

Use your own LLM for deeper reasoning.

```javascript
import { Marble } from 'marblism';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const marble = new Marble({
  mode: 'swarm',
  llm: async (prompt) => {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].text;
  }
});

await marble.init();
const stories = await marble.select(candidates, userContext);
// Each story now has deeper reasoning from 5 specialized agents
```

## 7. World Signal Integration

Enrich scoring with real-time trending data.

```javascript
import { WorldSignalAggregator } from 'marblism/adapters/signals/world.js';

const aggregator = new WorldSignalAggregator({
  sources: ['hackernews', 'reddit', 'trends'],
  maxResults: 30
});

// Get what the world is paying attention to
const worldSignals = await aggregator.aggregate({
  subreddits: ['technology', 'programming', 'startups'],
  keywords: ['AI', 'LLM', 'startup']
});

// Use world signals as story candidates
const marble = new Marble();
await marble.init();
const personalized = await marble.select(worldSignals);
```

## 8. Observer Monitoring

Track how well the system is performing.

```javascript
import { Observer } from 'marblism';

const observer = new Observer('./observer-data.json');

// After each feedback cycle
await observer.trackKPI('prediction_accuracy', 0.72);
await observer.trackKPI('signal_capture_rate', 0.68);
await observer.trackKPI('clone_fitness', 0.81);

// Weekly report
const report = await observer.getReport('week');
console.log('Prediction accuracy:', report.kpis.prediction_accuracy);
// { count: 45, average: 0.72, trend: 'improving', status: 'ok' }
```

---

## End-to-End Startup Integration

The examples above show individual features. Below are complete integration patterns showing how a startup wires Marble into a real product.

### 9. Express API — Personalized Feed Backend

Full REST API a mobile or web app can call.

```javascript
// server.js
import express from 'express';
import { Marblism } from 'marblism';
import { SignalProcessor } from 'marblism/core/signals.js';
import { Observer } from 'marblism';

const app = express();
app.use(express.json());

// One Marble instance per user, cached in memory
const engines = new Map();
const observer = new Observer('./data/observer.json');

async function getEngine(userId) {
  if (!engines.has(userId)) {
    const engine = new Marblism({
      dataPath: `./data/users/${userId}-kg.json`,
      mode: 'score',
      count: 10
    });
    await engine.init();
    engines.set(userId, engine);
  }
  return engines.get(userId);
}

// GET /feed/:userId — personalized feed
app.get('/feed/:userId', async (req, res) => {
  const engine = await getEngine(req.params.userId);

  // Your story source — database, RSS, whatever
  const rawStories = await fetchStoriesFromDB();

  // Optional: pass user's calendar/context from your app
  const context = req.query.context ? JSON.parse(req.query.context) : undefined;

  const feed = await engine.select(rawStories, context);

  res.json({
    stories: feed.map(s => ({
      id: s.story.id,
      title: s.story.title,
      summary: s.story.summary,
      score: s.magic_score,
      why: s.why,              // human-readable explanation
      position: s.arc_position // narrative arc slot
    }))
  });
});

// POST /signal — record user behavior
app.post('/signal', async (req, res) => {
  const { userId, storyId, type, value } = req.body;
  const engine = await getEngine(userId);

  if (type === 'reaction') {
    // Explicit: user tapped thumbs up/down
    await engine.react(storyId, value, req.body.topics);
  } else {
    // Implicit: dwell time, scroll depth, share
    const signals = new SignalProcessor();
    signals.recordSignal(storyId, type, value);

    const inferred = signals.inferReactions();
    for (const { storyId: sid, reaction, confidence } of inferred) {
      if (confidence > 0.6) {
        await engine.react(sid, reaction);
      }
    }
  }

  await observer.trackKPI('signal_capture_rate', 1);
  res.json({ ok: true });
});

// GET /health — system health for your monitoring
app.get('/health', async (req, res) => {
  const report = await observer.getReport('day');
  res.json({
    status: 'ok',
    activeUsers: engines.size,
    kpis: report.kpis
  });
});

app.listen(3000);
```

Your frontend just calls:
```bash
# Get feed
curl http://localhost:3000/feed/user_42

# Record a thumbs up
curl -X POST http://localhost:3000/signal \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_42","storyId":"s-789","type":"reaction","value":"up","topics":["ai","startup"]}'

# Record dwell time (implicit)
curl -X POST http://localhost:3000/signal \
  -H 'Content-Type: application/json' \
  -d '{"userId":"user_42","storyId":"s-789","type":"dwell","value":45000}'
```

### 10. React Frontend — Feed with Signal Tracking

Plug Marble's signal tracking into a React content feed.

```jsx
// hooks/useMarbleFeed.js
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '/api';

export function useMarbleFeed(userId) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch personalized feed
  useEffect(() => {
    fetch(`${API}/feed/${userId}`)
      .then(r => r.json())
      .then(data => { setStories(data.stories); setLoading(false); });
  }, [userId]);

  // Signal helpers
  const trackSignal = useCallback((storyId, type, value) => {
    fetch(`${API}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, storyId, type, value })
    });
  }, [userId]);

  return { stories, loading, trackSignal };
}

// components/StoryCard.jsx
export function StoryCard({ story, onSignal }) {
  const viewStart = useRef(null);

  // Track dwell time
  useEffect(() => {
    viewStart.current = Date.now();
    return () => {
      const dwell = Date.now() - viewStart.current;
      if (dwell > 2000) { // Only track if viewed > 2s
        onSignal(story.id, 'dwell', dwell);
      }
    };
  }, [story.id]);

  return (
    <article>
      <h3>{story.title}</h3>
      <p>{story.summary}</p>
      <p className="why">{story.why}</p>
      <div className="actions">
        <button onClick={() => onSignal(story.id, 'reaction', 'up')}>👍</button>
        <button onClick={() => onSignal(story.id, 'reaction', 'down')}>👎</button>
        <button onClick={() => onSignal(story.id, 'forward', 1)}>Share</button>
      </div>
    </article>
  );
}

// App.jsx
function App() {
  const { stories, loading, trackSignal } = useMarbleFeed('user_42');

  if (loading) return <p>Loading your feed...</p>;

  return (
    <div>
      {stories.map(story => (
        <StoryCard key={story.id} story={story} onSignal={trackSignal} />
      ))}
    </div>
  );
}
```

### 11. Cron Job — Daily Digest Pipeline

Run Marble overnight, deliver via email/Slack in the morning.

```javascript
// cron/daily-digest.mjs
import { Marblism } from 'marblism';
import { RSSAdapter } from 'marblism/adapters/sources/rss.js';
import { WorldSignalAggregator } from 'marblism/adapters/signals/world.js';
import { Observer } from 'marblism';
import fs from 'fs';

const USERS_DIR = './data/users';
const users = JSON.parse(fs.readFileSync('./data/user-list.json', 'utf8'));

// 1. Gather stories once (shared across all users)
const rss = new RSSAdapter({
  feeds: [
    'https://news.ycombinator.com/rss',
    'https://feeds.feedburner.com/TechCrunch',
    'https://www.producthunt.com/feed'
  ]
});
const stories = await rss.fetchStories({ limit: 100 });

// Optional: enrich with world signals
const world = new WorldSignalAggregator({ sources: ['hackernews', 'reddit'] });
const trending = await world.aggregate({ subreddits: ['startups', 'saas'] });
const allStories = [...stories, ...trending];

// 2. Personalize per user
const observer = new Observer('./data/observer.json');

for (const user of users) {
  const marble = new Marblism({
    dataPath: `${USERS_DIR}/${user.id}-kg.json`,
    mode: 'swarm',
    count: 10
  });
  await marble.init();

  const feed = await marble.select(allStories, {
    active_projects: user.projects,
    calendar: user.todayCalendar
  });

  // 3. Deliver (swap in your preferred channel)
  await sendDigestEmail(user.email, feed);
  // or: await postToSlack(user.slackWebhook, feed);

  await observer.trackKPI('prediction_accuracy',
    feed.reduce((sum, s) => sum + s.magic_score, 0) / feed.length
  );
}

console.log(`Digest sent to ${users.length} users`);
```

```bash
# Run daily at 6am
0 6 * * * node /app/cron/daily-digest.mjs >> /var/log/digest.log 2>&1
```

### 12. Startup PMF Validation — Before You Build

Test your idea against 50 synthetic user archetypes before writing code.

```javascript
// validate-idea.mjs
import { WorldSim } from 'marblism/worldsim';

const sim = new WorldSim({ verbose: true });

// Define your product
const myProduct = {
  name: 'FocusLoop',
  description: 'AI meeting summarizer that auto-creates tasks in your project tracker',
  categories: ['productivity', 'meetings', 'AI'],
  target_audience: 'remote startup teams (5-30 people)',
  pricing: '$12/user/month'
};

// Run simulation
const result = await sim.simulate(myProduct);

console.log('\n=== PMF Report ===');
console.log(`Score: ${result.pmf_score}/1.0`);
console.log(`Confidence: ${result.confidence}`);

// Which segments love it?
console.log('\nSegment breakdown:');
for (const seg of result.segments) {
  const bar = '█'.repeat(Math.round(seg.avgScore * 20));
  console.log(`  ${seg.name.padEnd(25)} ${bar} ${seg.avgScore.toFixed(2)} (${seg.viability})`);
}

// What messaging works?
console.log('\nRecommended positioning:');
for (const [segment, msg] of Object.entries(result.messaging)) {
  console.log(`  ${segment}: "${msg.positioning}"`);
}

// Red flags?
if (result.pmf_score < 0.4) {
  console.log('\n⚠ Low PMF — consider pivoting:');
  console.log(result.recommendations.join('\n  - '));
}
```

Output:
```
=== PMF Report ===
Score: 0.67/1.0
Confidence: high

Segment breakdown:
  Engineering Managers       ████████████████ 0.82 (strong)
  Startup Founders           ██████████████ 0.71 (moderate)
  Remote Team Leads          █████████████ 0.65 (moderate)
  Solo Developers            ████████ 0.38 (weak)

Recommended positioning:
  Engineering Managers: "Stop losing action items in meeting noise"
  Startup Founders: "Ship faster — meetings auto-generate your sprint backlog"
```
