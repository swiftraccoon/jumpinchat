
import * as chai from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

const { expect } = chai;

describe('getJanusToken.controller', () => {
  let controller;
  let req;
  let res;

  function createRes() {
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  describe('with valid config', () => {
    const fakeToken = '12345,janus,janus.plugin.videoroom:fakehmac==';

    beforeEach(async () => {
      controller = (await esmock('./getJanusToken.controller.js', {
        '../../../lib/janus.util.js': {
          default: {
            getJanusToken: sinon.stub().returns(fakeToken),
          },
        },
      })).default;
    });

    it('should return 200 with a token object', () => {
      req = {};
      createRes();
      controller(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
      expect(res.send.calledOnce).to.equal(true);
      const body = res.send.firstCall.args[0];
      expect(body).to.have.property('token');
      expect(body.token).to.equal(fakeToken);
    });

    it('should return a token containing HMAC signature separator', () => {
      req = {};
      createRes();
      controller(req, res);

      const body = res.send.firstCall.args[0];
      expect(body.token).to.include(':');
    });
  });

  describe('token format from real janus.util', () => {
    let realController;

    beforeEach(async () => {
      realController = (await esmock('./getJanusToken.controller.js', {
        '../../../config/env/index.js': {
          default: {
            janus: {
              token: {
                expire: 86400,
                secret: 'testsecret',
                plugins: 'janus.plugin.videoroom',
              },
            },
          },
        },
      })).default;
    });

    it('should generate a token with expiry, realm, plugins, and HMAC signature', () => {
      req = {};
      createRes();
      realController(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
      const body = res.send.firstCall.args[0];
      const token = body.token;

      // Token format: "expiry,janus,plugins:base64hmac"
      const [payload, signature] = token.split(':');
      expect(payload).to.be.a('string');
      expect(signature).to.be.a('string');

      const parts = payload.split(',');
      expect(parts).to.have.lengthOf(3);

      // First part is the expiry timestamp (numeric)
      const expiry = parseInt(parts[0], 10);
      expect(expiry).to.be.a('number');
      expect(expiry).to.be.greaterThan(Math.floor(Date.now() / 1000));

      // Second part is the realm
      expect(parts[1]).to.equal('janus');

      // Third part is the plugin list
      expect(parts[2]).to.equal('janus.plugin.videoroom');

      // Signature should be base64 encoded
      expect(signature.length).to.be.greaterThan(0);
    });

    it('should generate different tokens when called at different times', () => {
      req = {};
      createRes();
      realController(req, res);
      const token1 = res.send.firstCall.args[0].token;

      // Advance time slightly to get different expiry
      const clock = sinon.useFakeTimers(Date.now() + 1000);
      try {
        createRes();
        realController(req, res);
        const token2 = res.send.firstCall.args[0].token;
        expect(token2).to.not.equal(token1);
      } finally {
        clock.restore();
      }
    });
  });
});
