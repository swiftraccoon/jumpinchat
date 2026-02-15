
import * as chai from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

const { expect } = chai;

describe('janus.controller', () => {
  describe('getJanusEndpoints', () => {
    let getJanusEndpoints;
    let req;
    let res;

    function createReqRes(forwardedHost) {
      req = {
        get: sinon.stub(),
      };
      if (forwardedHost) {
        req.get.withArgs('x-forwarded-host').returns(forwardedHost);
      }
      res = {
        status: sinon.stub().returnsThis(),
        send: sinon.stub().returnsThis(),
      };
    }

    describe('with all URIs configured', () => {
      beforeEach(async () => {
        const mod = await esmock('./janus.controller.js', {
          '../../config/env/index.js': {
            default: {
              janus: {
                wss_uri: '/janus/ws',
                https_uri: '/janus/http',
                ws_uri: ':8188',
                http_uri: ':8088/janus',
              },
            },
          },
          '../room/room.utils.js': { default: {} },
        });
        getJanusEndpoints = mod.getJanusEndpoints;
      });

      it('should return all four endpoints in correct order', () => {
        createReqRes('example.com');
        getJanusEndpoints(req, res);

        expect(res.status.calledWith(200)).to.equal(true);
        const endpoints = res.send.firstCall.args[0];
        expect(endpoints).to.have.lengthOf(4);
        expect(endpoints[0]).to.equal('wss://example.com/janus/ws');
        expect(endpoints[1]).to.equal('https://example.com/janus/http');
        expect(endpoints[2]).to.equal('ws://example.com:8188');
        expect(endpoints[3]).to.equal('http://example.com:8088/janus');
      });

      it('should use x-forwarded-host header for hostname', () => {
        createReqRes('myhost.io');
        getJanusEndpoints(req, res);

        const endpoints = res.send.firstCall.args[0];
        expect(endpoints[0]).to.include('myhost.io');
      });

      it('should fall back to localhost when x-forwarded-host is missing', () => {
        createReqRes(null);
        getJanusEndpoints(req, res);

        const endpoints = res.send.firstCall.args[0];
        endpoints.forEach((ep) => {
          expect(ep).to.include('localhost');
        });
      });
    });

    describe('with only ws and http URIs configured', () => {
      beforeEach(async () => {
        const mod = await esmock('./janus.controller.js', {
          '../../config/env/index.js': {
            default: {
              janus: {
                wss_uri: undefined,
                https_uri: undefined,
                ws_uri: ':8188',
                http_uri: ':8088/janus',
              },
            },
          },
          '../room/room.utils.js': { default: {} },
        });
        getJanusEndpoints = mod.getJanusEndpoints;
      });

      it('should return only ws and http endpoints', () => {
        createReqRes('example.com');
        getJanusEndpoints(req, res);

        const endpoints = res.send.firstCall.args[0];
        expect(endpoints).to.have.lengthOf(2);
        expect(endpoints[0]).to.equal('ws://example.com:8188');
        expect(endpoints[1]).to.equal('http://example.com:8088/janus');
      });
    });

    describe('with no URIs configured', () => {
      beforeEach(async () => {
        const mod = await esmock('./janus.controller.js', {
          '../../config/env/index.js': {
            default: {
              janus: {},
            },
          },
          '../room/room.utils.js': { default: {} },
        });
        getJanusEndpoints = mod.getJanusEndpoints;
      });

      it('should return an empty array', () => {
        createReqRes('example.com');
        getJanusEndpoints(req, res);

        const endpoints = res.send.firstCall.args[0];
        expect(endpoints).to.deep.equal([]);
      });
    });

    describe('with only secure URIs configured', () => {
      beforeEach(async () => {
        const mod = await esmock('./janus.controller.js', {
          '../../config/env/index.js': {
            default: {
              janus: {
                wss_uri: '/janus/ws',
                https_uri: '/janus/http',
              },
            },
          },
          '../room/room.utils.js': { default: {} },
        });
        getJanusEndpoints = mod.getJanusEndpoints;
      });

      it('should return only wss and https endpoints', () => {
        createReqRes('secure.example.com');
        getJanusEndpoints(req, res);

        const endpoints = res.send.firstCall.args[0];
        expect(endpoints).to.have.lengthOf(2);
        expect(endpoints[0]).to.equal('wss://secure.example.com/janus/ws');
        expect(endpoints[1]).to.equal('https://secure.example.com/janus/http');
      });
    });
  });
});
