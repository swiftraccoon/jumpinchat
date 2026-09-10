import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import jwt from 'jsonwebtoken';

const sessionID = 'fixture-session';
const secret = 'fixture-test-secret';
const memberId = '507f1f77bcf86cd799439011';
const roomId = '507f1f77bcf86cd799439012';

describe('socket session recovery', () => {
  let controller;
  let req;
  let res;
  let hashes;
  let room;
  let calls;
  let updateOne;
  let replacement;
  let joined;
  let callPromise;
  let replacementVisible;

  beforeEach(async () => {
    req = { params: { oldId: 'old', newId: 'new' }, sessionID };
    res = { status: sinon.stub().returnsThis(), send: sinon.spy() };
    calls = [];
    hashes = new Map([['old', {
      name: 'fixture-room', userListId: memberId, disconnected: 'true', reconnectUntil: String(Date.now() + 60000),
    }]]);
    room = { _id: roomId, users: [{ _id: memberId, socket_id: 'old', session_id: sessionID }] };
    joined = false;
    replacementVisible = true;
    replacement = {
      id: 'new', handshake: { auth: { token: jwt.sign({ session: sessionID }, secret) } },
      join: sinon.spy(() => { calls.push('join'); joined = true; }),
    };
    const io = { in: scope => ({ fetchSockets: async () => (
      scope === 'fixture-room' ? (joined ? [replacement] : []) : (replacementVisible ? [replacement] : [])
    ) }) };
    callPromise = sinon.spy(async (method, key, value) => {
      calls.push(method);
      if (method === 'hmset') hashes.set(key, { ...hashes.get(key), ...value });
      if (method === 'hDel') delete hashes.get(key)[value];
      if (method === 'del') hashes.delete(key);
      return 1;
    });
    updateOne = sinon.spy(async () => {
      calls.push('map');
      room.users[0].socket_id = 'new';
      return { matchedCount: 1 };
    });
    controller = await esmock.strict('./user.updateSession.js', {
      '../../../config/env/index.js': { default: { auth: { jwt_secret: secret } } },
      '../../../utils/logger.util.js': { default: () => ({ info() {}, error() {} }) },
      '../../room/room.utils.js': { default: {
        getSocketCacheInfo: async id => hashes.get(id), getRoomByName: async () => room,
      } },
      '../../room/room.model.js': { default: { updateOne: (...args) => updateOne(...args) } },
      '../user.socket.js': { default: { getIo: () => io } },
      '../../../utils/redis.util.js': { default: { callPromise } },
    });
  });

  it('moves the member atomically, confirms room join, and expires the new cache before deleting the old one', async () => {
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(200);
    expect(hashes.has('old')).to.equal(false);
    expect(hashes.get('new')).to.eql({ name: 'fixture-room', userListId: memberId, disconnected: 'false' });
    expect(callPromise.calledWith('expire', 'new', 86400)).to.equal(true);
    expect(callPromise.calledWith('set', memberId, 'new', { EX: 3600 })).to.equal(true);
    expect(updateOne.firstCall.args[0]).to.eql({
      _id: roomId, users: { $elemMatch: { _id: memberId, socket_id: 'old', session_id: sessionID } },
    });
    expect(calls.indexOf('map')).to.be.lessThan(calls.indexOf('join'));
    expect(calls.indexOf('join')).to.be.lessThan(calls.indexOf('del'));
  });

  it('accepts a retry after the successful response was lost', async () => {
    await controller(req, res);
    res.status.resetHistory();
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(200);
    expect(updateOne.callCount).to.equal(1);
    expect(room.users[0]._id).to.equal(memberId);
  });

  it('retains old cache when room mapping fails, permitting another attempt', async () => {
    updateOne = sinon.stub().rejects(new Error('database unavailable'));
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(hashes.has('old')).to.equal(true);
    expect(replacement.join.called).to.equal(false);
  });

  it('retries a completed mapping when the room join has not propagated yet', async () => {
    replacement.join = sinon.spy(() => {});
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(503);
    expect(hashes.has('old')).to.equal(true);
    joined = true;
    res.status.resetHistory();
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(200);
    expect(updateOne.callCount).to.equal(1);
  });

  it('does not recreate membership removed at the grace deadline', async () => {
    updateOne = sinon.stub().resolves({ matchedCount: 0 });
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(hashes.has('old')).to.equal(true);
    expect(replacement.join.called).to.equal(false);
  });

  it('rejects missing cache or membership before writing', async () => {
    hashes.clear();
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(callPromise.called).to.equal(false);
  });

  it('requires the HTTP session to match the authenticated socket and room member', async () => {
    req.sessionID = 'different-session';
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(callPromise.called).to.equal(false);
    req.sessionID = sessionID;
    room.users[0].session_id = 'different-session';
    res.status.resetHistory();
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(callPromise.called).to.equal(false);
  });

  it('does not mutate cache if the replacement socket disconnected again', async () => {
    replacementVisible = false;
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(callPromise.called).to.equal(false);
  });

  it('does not delete its own cache on a same-ID membership check', async () => {
    req.params.oldId = 'new';
    hashes.set('new', hashes.get('old'));
    hashes.delete('old');
    room.users[0].socket_id = 'new';
    await controller(req, res);
    expect(res.status.firstCall.args[0]).to.equal(200);
    expect(hashes.has('new')).to.equal(true);
    expect(callPromise.calledWith('del', 'new')).to.equal(false);
  });
});
