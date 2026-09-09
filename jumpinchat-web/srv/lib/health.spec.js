import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import { registerHealthRoutes } from './health.js';

describe('health endpoints', () => {
  let app;
  let ready;
  let check;
  beforeEach(() => {
    app = express();
    ready = false;
    check = async () => {};
    registerHealthRoutes(app, { isReady: () => ready, check: () => check(), timeoutMs: 20 });
    app.use(() => { throw new Error('Health must bypass session middleware'); });
  });

  it('keeps liveness available before dependencies are ready', async () => {
    await request(app).get('/health/live').expect(200);
    await request(app).get('/health').expect(200);
    await request(app).get('/health/ready').expect(503);
  });

  it('requires both connection state and a successful dependency probe', async () => {
    ready = true;
    await request(app).get('/health/ready').expect(200);
    check = async () => { throw new Error('database unavailable'); };
    await request(app).get('/health/ready').expect(503);
    await request(app).get('/health/live').expect(200);
  });

  it('bounds a stalled dependency check', async () => {
    ready = true;
    check = () => new Promise(() => {});
    await request(app).get('/health/ready').expect(503);
  });

  it('fails readiness if shutdown starts during a probe', async () => {
    ready = true;
    check = async () => { ready = false; };
    await request(app).get('/health/ready').expect(503);
  });
});
