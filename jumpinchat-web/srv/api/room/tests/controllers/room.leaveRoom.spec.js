import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';

let leaveRoom, enqueue, redis, destroySession;
const socketData = { name: 'testroom', janusServerId: 'janus', janusSessionId: 123 };
const departing = { handle: 'Alice', socket_id: 'old-socket' };

async function setUp() {
  enqueue = sinon.stub();
  redis = sinon.stub().resolves();
  redis.withArgs('hgetall', 'old-socket').resolves(socketData);
  destroySession = sinon.stub().resolves();
  leaveRoom = (await esmock.strict('../../controllers/room.leaveRoom.js', {
    '../../room.utils.js': { default: { addToRemoveUserQueue: enqueue } },
    '../../../../utils/redis.util.js': { default: { callPromise: redis } },
    '../../../../lib/janus.util.js': { default: { destroySession } },
    '../../../../utils/logger.util.js': { default: () => ({ debug() {}, info() {}, error() {}, fatal() {} }) },
  })).default;
}

function leave() {
  return new Promise((resolve, reject) => {
    leaveRoom('old-socket', (err, room, user) => err ? reject(err) : resolve({ room, user }));
  });
}

describe('room departure and media cleanup', () => {
  beforeEach(setUp);

  it('waits for membership removal before destroying media and marking the cache disconnected', async () => {
    const complete = sinon.stub();
    await leaveRoom('old-socket', complete);
    assert.deepEqual(enqueue.firstCall.args.slice(0, 2), ['old-socket', 'testroom']);
    assert.equal(destroySession.called, false);
    assert.equal(redis.calledWith('hmset'), false);
    await enqueue.firstCall.args[2](null, departing);
    assert.deepEqual(destroySession.firstCall.args, ['janus', 123]);
    assert.equal(redis.calledWith('hmset', 'old-socket', { ...socketData, disconnected: true }), true);
    assert.equal(redis.calledWith('expire', 'old-socket', 36000), true);
    assert.deepEqual(complete.firstCall.args, [null, 'testroom', departing]);
  });

  it('leaves recovered media and cache untouched when the old member is no longer present', async () => {
    enqueue.yields(null, null);
    assert.deepEqual(await leave(), { room: 'testroom', user: null });
    assert.equal(destroySession.called, false);
    assert.equal(redis.calledWith('hmset'), false);
  });

  it('does not destroy media when membership removal fails', async () => {
    enqueue.yields(new Error('membership unavailable'));
    await assert.rejects(leave(), /membership unavailable/);
    assert.equal(destroySession.called, false);
    assert.equal(redis.calledWith('hmset'), false);
  });

  it('finishes room departure even if Janus cleanup fails', async () => {
    enqueue.yields(null, departing);
    destroySession.rejects(new Error('Janus unavailable'));
    assert.deepEqual(await leave(), { room: 'testroom', user: departing });
    assert.equal(redis.calledWith('hmset'), true);
  });

  it('does not enqueue cleanup for a missing socket cache', async () => {
    redis.withArgs('hgetall', 'old-socket').resolves(null);
    await assert.rejects(leave(), /Error fetching session/);
    assert.equal(enqueue.called, false);
    assert.equal(destroySession.called, false);
  });
});
