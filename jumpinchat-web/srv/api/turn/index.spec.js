import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import sinon from 'sinon';
import esmock from 'esmock';

describe('TURN route session authorization', () => {
  const secret = 'isolated-turn-session-test-secret';
  let app;
  let issueCredentials;

  before(async () => {
    const { validateSession } = await esmock.strict('../../utils/utils.js', {
      '../../config/env/index.js': { default: { auth: { jwt_secret: secret } } },
      '../user/user.utils.js': { default: {} },
      '../room/room.utils.js': { default: {} },
      '../../utils/redis.util.js': { default: {} },
      '../../utils/rateLimit.js': { default: (_req, _res, next) => next() },
      '../../utils/logger.util.js': { default: () => ({ warn() {}, error() {}, fatal() {} }) },
    });
    issueCredentials = sinon.spy((_req, res) => res.status(200).json({ authorized: true }));
    const router = await esmock.strict('./index.js', {
      '../../utils/utils.js': { default: { validateSession } },
      './turn.controller.js': { default: { getTurnCreds: issueCredentials } },
    });
    app = express();
    app.use(cookieParser());
    app.use('/api/turn', router);
  });

  beforeEach(() => issueCredentials.resetHistory());

  for (const method of ['get', 'post']) {
    it(`rejects ${method.toUpperCase()} without an activity token before credential issuance`, async () => {
      await request(app)[method]('/api/turn/').expect(401);
      sinon.assert.notCalled(issueCredentials);
    });

    it(`accepts ${method.toUpperCase()} from a guest session without an account cookie`, async () => {
      const token = jwt.sign({ session: 'guest-session-fixture' }, secret);
      await request(app)[method]('/api/turn/').set('Cookie', `jic.activity=${token}`)
        .expect(200, { authorized: true });
      sinon.assert.calledOnce(issueCredentials);
      assert.equal(issueCredentials.firstCall.args[0].cookies['jic.ident'], undefined);
    });

    it(`accepts ${method.toUpperCase()} for an account holder with the same activity-session contract`, async () => {
      const token = jwt.sign({ session: 'account-session-fixture' }, secret);
      await request(app)[method]('/api/turn/')
        .set('Cookie', [`jic.activity=${token}`, 'jic.ident=account-fixture'])
        .expect(200, { authorized: true });
      sinon.assert.calledOnce(issueCredentials);
    });

    for (const [name, token] of [
      ['invalid signature', jwt.sign({ session: 'fixture' }, 'different-isolated-secret')],
      ['expired token', jwt.sign({ session: 'fixture', exp: 1 }, secret)],
      ['unreadable token', 'unreadable-fixture'],
    ]) {
      it(`rejects ${method.toUpperCase()} with an ${name} before credential issuance`, async () => {
        await request(app)[method]('/api/turn/').set('Cookie', `jic.activity=${token}`).expect(403);
        sinon.assert.notCalled(issueCredentials);
      });
    }
  }
});
