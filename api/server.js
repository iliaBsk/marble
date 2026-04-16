#!/usr/bin/env node

/**
 * Marble API Server
 * Mounts calibration + onboarding routes on a single Express app.
 */

import express from 'express';
import cors from 'cors';
import { Marble } from '../core/index.js';
import { mountOnboarding } from './onboarding-server.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const STORAGE = process.env.MARBLE_ONBOARDING_STORAGE || './marble-kg.json';

async function start() {
  const app = express();
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:3002'];

  app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  }));
  app.use(express.json({ limit: '64kb' }));

  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  const marble = new Marble({ storage: STORAGE });
  await marble.init();

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Mount onboarding routes under /onboarding
  mountOnboarding(app, { marble });

  // Mount calibration routes if the module exists
  try {
    const { CalibrationServer } = await import('./calibration-server.js');
    const cal = new CalibrationServer();
    app.use('/calibration', cal.app);
  } catch {
    // Calibration server unavailable — non-fatal
  }

  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`Marble API running on http://localhost:${PORT}`);
    console.log(`  POST /onboarding/submit        — one-shot onboarding`);
    console.log(`  POST /onboarding/submit/stream — streaming SSE onboarding`);
    console.log(`  GET  /onboarding/steps         — wizard step definitions`);
    console.log(`  GET  /onboarding/shops?city=   — local shop chips`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
