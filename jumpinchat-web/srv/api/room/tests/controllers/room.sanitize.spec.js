import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('Room Sanitize Controller', () => {
  let sanitize;
  let leaveRoom;
  let del;
  let retained;
  let retainConnectedUsers;
  let users;

  beforeEach(async () => {
    users = [{ socket_id: 'connected' }, { socket_id: 'recovering' }, { socket_id: 'expired' }];
    retained = [users[0]];
    leaveRoom = sinon.stub().yields();
    del = sinon.stub().resolves();
    retainConnectedUsers = sinon.spy(async () => retained);
    sanitize = await esmock.strict('../../controllers/room.sanitize.js', {
      '../../room.controller.js': { default: {
        getSocketIo: () => ({ in: () => ({ fetchSockets: async () => [{ id: 'connected' }] }) }),
        leaveRoom,
      } },
      '../../room.utils.js': { default: {
        getRoomByName: sinon.stub().yields(null, { name: 'fixture', users }),
      } },
      '../../../../lib/redis.util.js': { default: () => ({ del }) },
      '../../../../utils/socketRecovery.util.js': {
        retainConnectedUsers: (...args) => retainConnectedUsers(...args),
      },
    });
  });

  it('cleans up each disconnected member outside its reconnect grace', async () => {
    await new Promise((resolve, reject) => sanitize('fixture', err => err ? reject(err) : resolve()));
    expect(retainConnectedUsers.calledWith(users, ['connected'])).to.equal(true);
    expect(leaveRoom.getCalls().map(call => call.args[0])).to.eql(['recovering', 'expired']);
    expect(del.getCalls().map(call => call.args[0])).to.eql(['recovering', 'expired']);
  });

  it('preserves reconnecting room members and their session hashes', async () => {
    retained = [users[0], users[1]];
    await new Promise((resolve, reject) => sanitize('fixture', err => err ? reject(err) : resolve()));
    expect(leaveRoom.getCalls().map(call => call.args[0])).to.eql(['expired']);
    expect(del.calledWith('recovering')).to.equal(false);
  });

  it('does not remove members when reconnect grace cannot be checked', async () => {
    retainConnectedUsers = sinon.stub().rejects(new Error('cache unavailable'));
    const error = await new Promise(resolve => sanitize('fixture', resolve));
    expect(error.message).to.equal('cache unavailable');
    expect(leaveRoom.called).to.equal(false);
    expect(del.called).to.equal(false);
  });
});
