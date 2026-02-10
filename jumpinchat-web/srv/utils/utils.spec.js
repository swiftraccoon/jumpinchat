/* global describe,it,beforeEach */

import { expect } from 'chai';
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
  let awsMock;

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

    awsMock = {
      S3Client: class S3Client { send() { return Promise.resolve(); } },
      PutObjectCommand: class PutObjectCommand {},
      DeleteObjectCommand: class DeleteObjectCommand {},
      GetObjectCommand: class GetObjectCommand {},
    };

    next = sinon.spy();

    controller = await esmock('./utils.js', {
      '../api/user/user.utils.js': userUtilsMock,
      '../api/room/room.utils.js': {},
      './redis.util.js': { callPromise: sinon.stub() },
      './rateLimit.js': sinon.stub(),
      '@aws-sdk/client-s3': awsMock,
      '@aws-sdk/s3-request-presigner': { getSignedUrl: sinon.stub().resolves('https://signed-url') },
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
        '@aws-sdk/client-s3': awsMock,
        '@aws-sdk/s3-request-presigner': { getSignedUrl: sinon.stub().resolves('https://signed-url') },
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
});
