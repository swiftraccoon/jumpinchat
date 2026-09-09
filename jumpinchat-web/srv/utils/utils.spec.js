/* global describe,it,beforeEach */

import { expect } from 'chai';
import { Jimp } from 'jimp';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import config from '../config/env/index.js';
import esmock from 'esmock';
describe('utils', () => {
  let req;
  let res;
  let next;
  let sendSpy;
  let controller;
  let redisMock;
  let userUtilsMock;

  beforeEach(async function beforeEach() {
    this.timeout(5000);
    sendSpy = new Promise(resolve => resolve());
    redisMock = () => ({});
    userUtilsMock = {
      getUserById: sinon.stub().yields(null, { username: 'foo' }),
    };

    req = {
      headers: { authorization: '' },
      cookies: {
        'jic.activity': jwt.sign({
          foo: 'bar',
        }, config.auth.jwt_secret),
      },
      signedCookies: {
        'jic.ident': 'foo',
      },
    };

    res = {
      status: sinon.spy(() => ({
        send: () => sendSpy,
      })),
    };

    next = sinon.spy();

    controller = await esmock('./utils.js', {
      '../api/user/user.utils.js': userUtilsMock,
      '../api/room/room.utils.js': {},
      './redis.util.js': { callPromise: sinon.stub() },
      './rateLimit.js': sinon.stub(),
    });
  });

  describe('validateSession', () => {
    it('should reject with 401 if token missing', (done) => {
      req.cookies = {};
      controller.validateSession(req, res, next);

      sendSpy.then(() => {
        expect(res.status.firstCall.args[0]).to.equal(401);
        done();
      });
    });

    it('should call `next` if session token is verified', (done) => {
      controller.validateSession(req, res, () => {
        done();
      });
    });
  });

  describe('validateAccount', () => {
    it('should respond with a 401 if there is no ident cookie', (done) => {
      req.signedCookies = {};
      controller.validateAccount(req, res, next);

      sendSpy.then(() => {
        expect(res.status.firstCall.args[0]).to.equal(401);
        done();
      });
    });

    it('should respond with a 401 if there is no user', async () => {
      req.signedCookies = {
        'jic.ident': 'foo',
      };

      const noUserUtilsMock = {
        getUserById: sinon.stub().yields(null),
      };

      const ctrl = await esmock('./utils.js', {
        '../api/user/user.utils.js': { default: noUserUtilsMock, ...noUserUtilsMock },
        '../api/room/room.utils.js': {},
        './redis.util.js': { callPromise: sinon.stub() },
        './rateLimit.js': sinon.stub(),
      });

      ctrl.validateAccount(req, res, next);

      await sendSpy;
      expect(res.status.firstCall.args[0]).to.equal(401);
    });

    it('should call `next` if user found', (done) => {
      req.signedCookies = {
        'jic.ident': 'foo',
      };

      controller.validateAccount(req, res, () => {
        done();
      });
    });
  });
  describe('image conversion with Jimp 1.6', () => {
    for (const mime of ['image/png', 'image/jpeg']) {
      it(`decodes and resizes ${mime} uploads to the requested dimensions`, async () => {
        const original = new Jimp({ width: 16, height: 8, color: 0xff0000ff });
        const input = await original.getBuffer(mime);
        const output = await new Promise((resolve, reject) => {
          controller.convertImages(input, { width: 32, height: 32 },
            (err, buffer) => err ? reject(err) : resolve(buffer));
        });
        const converted = await Jimp.read(output);
        expect(converted.bitmap.width).to.equal(32);
        expect(converted.bitmap.height).to.equal(32);
        expect(converted.mime).to.equal(mime);
      });
    }
    it('returns a decode error for non-image input', async () => {
      const result = await new Promise(resolve => controller.convertImages(Buffer.from('ordinary text'),
        { width: 32, height: 32 }, (err, buffer) => resolve({ err, buffer })));
      expect(result.err).to.be.instanceOf(Error);
      expect(result.buffer).to.equal(undefined);
    });
  });

});
