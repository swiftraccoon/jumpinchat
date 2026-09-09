import express from 'express';
import { expect } from 'chai';
import { registerHealthRoutes } from './health.js';

describe('homepage health', () => {
  let server;
  let base;
  let ready;
  let check;
  beforeEach(async () => {
    ready = false;
    check = async () => {};
    const app = express();
    registerHealthRoutes(app, { isReady: () => ready, check: () => check(), timeoutMs: 20 });
    app.use((req, res) => res.status(500).send('session middleware must not run'));
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(() => new Promise(resolve => server.close(resolve)));

  it('separates liveness from dependency readiness without sessions', async () => {
    expect((await fetch(`${base}/health/live`)).status).to.equal(200);
    expect((await fetch(`${base}/health/ready`)).status).to.equal(503);
    ready = true;
    expect((await fetch(`${base}/health/ready`)).status).to.equal(200);
  });

  it('returns unavailable when a database probe fails or stalls', async () => {
    ready = true;
    check = async () => { throw new Error('database offline'); };
    expect((await fetch(`${base}/health/ready`)).status).to.equal(503);
    check = () => new Promise(() => {});
    expect((await fetch(`${base}/health/ready`)).status).to.equal(503);
  });
});
