#!/usr/bin/env node

/**
 * Marble web static server.
 * Serves the onboarding wizard, dashboard, reader, and signal tracker.
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.WEB_PORT || '3002', 10);
const API_BASE = process.env.API_BASE || 'http://localhost:3001';

const app = express();

// Serve onboarding wizard files
app.use('/onboarding', express.static(join(__dirname, 'onboarding')));

// Redirect root to onboarding for new users
app.get('/', (req, res) => {
  res.redirect('/onboarding/');
});

// Onboarding index page
app.get('/onboarding', (req, res) => {
  res.sendFile(join(__dirname, 'onboarding', 'index.html'));
});

// Proxy API calls so wizard can reach /onboarding/* without CORS issues
const { default: fetch } = await import('node-fetch');

app.use('/onboarding/steps', async (req, res) => {
  try {
    const r = await fetch(`${API_BASE}/onboarding/steps`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(502).json({ success: false, error: 'API server unreachable' });
  }
});

app.use('/onboarding/shops', async (req, res) => {
  try {
    const city = req.query.city || '';
    const r = await fetch(`${API_BASE}/onboarding/shops?city=${encodeURIComponent(city)}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(502).json({ success: false, error: 'API server unreachable' });
  }
});

app.post('/onboarding/submit', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const r = await fetch(`${API_BASE}/onboarding/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(502).json({ success: false, error: 'API server unreachable' });
  }
});

app.post('/onboarding/submit/stream', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const r = await fetch(`${API_BASE}/onboarding/submit/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    r.body.pipe(res);
  } catch {
    res.status(502).json({ success: false, error: 'API server unreachable' });
  }
});

app.listen(PORT, () => {
  console.log(`Marble web server on http://localhost:${PORT}`);
  console.log(`  /onboarding/ — onboarding wizard`);
  console.log(`  API proxied to ${API_BASE}`);
});
