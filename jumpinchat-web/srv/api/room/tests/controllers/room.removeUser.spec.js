import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';

const departing = { handle: 'Alice', socket_id: 'old-socket' };
let removeUser, findOneAndUpdate, removeRoom;

async function setUp() {
  findOneAndUpdate = sinon.stub().resolves({ users: [departing, { socket_id: 'other-socket' }] });
  removeRoom = sinon.stub().yields(null);
  removeUser = (await esmock.strict('../../controllers/room.removeUser.js', {
    '../../room.model.js': { default: { findOneAndUpdate } },
    '../../controllers/room.remove.js': { default: removeRoom },
  })).default;
}

function remove() {
  return new Promise((resolve, reject) => {
    removeUser('old-socket', { name: 'testroom' }, (err, user) => err ? reject(err) : resolve(user));
  });
}

describe('atomic room member removal', () => {
  beforeEach(setUp);

  it('removes only the departing socket and returns its prior member', async () => {
    assert.deepEqual(await remove(), departing);
    assert.deepEqual(findOneAndUpdate.firstCall.args, [
      { name: 'testroom', 'users.socket_id': 'old-socket' },
      { $pull: { users: { socket_id: 'old-socket' } } },
      { returnDocument: 'before' },
    ]);
    assert.equal(removeRoom.called, false);
  });

  it('preserves a member whose socket mapping was already recovered', async () => {
    findOneAndUpdate.resolves(null);
    assert.equal(await remove(), null);
    assert.equal(removeRoom.called, false);
  });

  it('cleans up an empty room and retains the departing user for disconnect notifications', async () => {
    findOneAndUpdate.resolves({ users: [departing] });
    assert.deepEqual(await remove(), departing);
    assert.deepEqual(removeRoom.firstCall.args[0], { name: 'testroom' });
  });

  it('reports a failed membership removal without removing the room', async () => {
    findOneAndUpdate.rejects(new Error('database unavailable'));
    await assert.rejects(remove(), /database unavailable/);
    assert.equal(removeRoom.called, false);
  });

  it('reports a failed empty-room cleanup', async () => {
    findOneAndUpdate.resolves({ users: [departing] });
    removeRoom.yields(new Error('cleanup unavailable'));
    await assert.rejects(remove(), /cleanup unavailable/);
  });
});
