import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sinon from 'sinon';
import esmock from 'esmock';

describe('coturn credentials', () => {
  const secret = 'isolated-test-turn-secret';
  async function controller(uris, turnSecret = secret) {
    return esmock('./turn.controller.js', { '../../config/env/index.js': {
      turn: { uris, ttl: '3600' }, auth: { turnSecret },
    } });
  }
  function response() {
    return { status: sinon.stub().returnsThis(), send: sinon.stub().returnsThis() };
  }
  it('expands hostnames to UDP/TCP and preserves explicit TLS URIs', async () => {
    const { getTurnCreds } = await controller(['relay.example.test', 'turns:secure.example.test:5349?transport=tcp']);
    const res = response();
    getTurnCreds({ query: { username: 'guest' } }, res);
    const body = res.send.firstCall.args[0];
    assert.deepEqual(body.uris, ['turn:relay.example.test:3478?transport=udp',
      'turn:relay.example.test:3478?transport=tcp', 'turns:secure.example.test:5349?transport=tcp']);
    assert.equal(body.password, crypto.createHmac('sha1', secret).update(body.username).digest('base64'));
    const expiry = Number(body.username.split(':')[0]);
    assert.ok(Math.abs(expiry - Math.floor(Date.now() / 1000) - 3600) <= 1);
  });
  it('returns no relay configuration when TURN is disabled', async () => {
    const { getTurnCreds } = await controller([], '');
    const res = response();
    getTurnCreds({ query: {} }, res);
    assert.deepEqual(res.send.firstCall.args[0], { uris: [], ttl: 0 });
  });
  it('rejects configured relays without a shared secret', async () => {
    const { getTurnCreds } = await controller(['relay.example.test'], '');
    const res = response();
    getTurnCreds({ query: {} }, res);
    assert.equal(res.status.firstCall.args[0], 503);
  });
});
