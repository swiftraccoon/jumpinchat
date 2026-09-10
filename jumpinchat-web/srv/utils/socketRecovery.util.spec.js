import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('socket reconnect grace', () => {
  let recovery;
  let cache;
  let callPromise;
  beforeEach(async () => {
    cache = new Map();
    callPromise = sinon.spy(async (method, key) => cache.get(key));
    recovery = await esmock.strict('./socketRecovery.util.js', {
      './redis.util.js': { default: { callPromise } },
    });
  });
  it('retains connected users and only unexpired reconnecting users', async () => {
    const now = Date.now();
    cache.set('recovering', { reconnectUntil: String(now + 30000) });
    cache.set('expired', { reconnectUntil: String(now - 1) });
    const users = ['connected', 'recovering', 'expired', 'missing', null].map(socket_id => ({ socket_id }));
    const retained = await recovery.retainConnectedUsers(users, ['connected']);
    expect(retained.map(user => user.socket_id)).to.eql(['connected', 'recovering']);
    expect(callPromise.calledWith('hgetall', 'connected')).to.equal(false);
    expect(callPromise.calledWith('hgetall', null)).to.equal(false);
  });
  it('treats the deadline as exclusive and invalid dates as expired', () => {
    expect(recovery.hasReconnectDeadline({ reconnectUntil: '100' }, 99)).to.equal(true);
    expect(recovery.hasReconnectDeadline({ reconnectUntil: '100' }, 100)).to.equal(false);
    expect(recovery.hasReconnectDeadline({ reconnectUntil: 'bad' }, 1)).to.equal(false);
    expect(recovery.hasReconnectDeadline(null, 1)).to.equal(false);
  });
  it('does not remove users when cache availability prevents checking grace', async () => {
    callPromise = sinon.stub().rejects(new Error('redis unavailable'));
    recovery = await esmock.strict('./socketRecovery.util.js', {
      './redis.util.js': { default: { callPromise } },
    });
    try {
      await recovery.retainConnectedUsers([{ socket_id: 'unknown' }], []);
      throw new Error('expected unavailable cache to reject');
    } catch (err) {
      expect(err.message).to.equal('redis unavailable');
    }
  });
});
