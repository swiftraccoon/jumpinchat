import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('handleSilenceUser socket', () => {
  const createHandler = async (overrides = {}) => {
    const getSocketCacheInfo = overrides.getSocketCacheInfo || sinon.stub().resolves({
      name: 'testroom',
      handle: 'moderator',
      userId: 'mod_user_id',
      userListId: 'mod_list_id',
    });

    const getRoomByName = overrides.getRoomByName || sinon.stub().resolves({
      users: [
        { _id: 'target_list_id', handle: 'targetuser', socket_id: 'target_socket', isAdmin: false, isSiteMod: false },
        { _id: 'mod_list_id', handle: 'moderator', socket_id: 'mod_socket', isAdmin: false, isSiteMod: false },
      ],
    });

    const getUserHasRolePermissions = overrides.getUserHasRolePermissions || sinon.stub().resolves();
    const redisSet = overrides.redisSet || sinon.stub().resolves();
    const redisExpire = overrides.redisExpire || sinon.stub().resolves();

    const callPromise = sinon.stub();
    callPromise.withArgs('set').returns(redisSet());
    callPromise.withArgs('expire').returns(redisExpire());

    const messageFactory = sinon.stub().callsFake(m => m);

    return esmock('../../sockets/handleSilenceUser.socket.js', {
      '../../room.utils.js': {
        getSocketCacheInfo,
        getRoomByName,
      },
      '../../../../utils/utils.js': {
        default: {
          getIpFromSocket: sinon.stub().returns('127.0.0.1'),
          messageFactory,
        },
      },
      '../../../../utils/error.util.js': {
        PermissionError: class PermissionError extends Error {
          constructor(msg) { super(msg); this.name = 'PermissionError'; }
        },
        NotFoundError: { name: 'NotFoundError' },
      },
      '../../../role/role.utils.js': {
        getUserHasRolePermissions,
      },
      '../../../../utils/redis.util.js': {
        default: { callPromise },
      },
      '../../../../config/env/index.js': {
        default: { room: { defaultSilenceTimeout: 300 } },
      },
      jsonwebtoken: {
        default: { decode: sinon.stub().returns({ session: 'session_1' }) },
      },
    });
  };

  const socketMock = (emit) => ({
    id: 'mod_socket',
    emit: emit || sinon.spy(),
    handshake: {
      auth: { token: 'jwt_token' },
    },
  });

  it('should emit error when getSocketCacheInfo fails', async () => {
    const getSocketCacheInfo = sinon.stub().rejects(new Error('cache fail'));
    const handler = await createHandler({ getSocketCacheInfo });

    await new Promise((resolve) => {
      const socket = socketMock((msg, data) => {
        if (msg === 'client::error') {
          expect(data.context).to.equal('banner');
          resolve();
        }
      });
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_list_id' });
    });
  });

  it('should emit error when lacking muteUserChat permission', async () => {
    // Use a generic error (non-PermissionError) to test the generic error path
    const getUserHasRolePermissions = sinon.stub().rejects(new Error('No permission'));
    const handler = await createHandler({ getUserHasRolePermissions });

    await new Promise((resolve) => {
      const socket = socketMock((msg, data) => {
        if (msg === 'client::error') {
          expect(data.context).to.equal('banner');
          expect(data.message).to.equal('Server error attempting to clear feed.');
          resolve();
        }
      });
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_list_id' });
    });
  });

  it('should emit error when target user not found', async () => {
    const getRoomByName = sinon.stub().resolves({
      users: [
        { _id: 'mod_list_id', handle: 'moderator', socket_id: 'mod_socket' },
      ],
    });
    const handler = await createHandler({ getRoomByName });

    await new Promise((resolve) => {
      const socket = socketMock((msg, data) => {
        if (msg === 'client::error') {
          expect(data.context).to.equal('alert');
          expect(data.message).to.equal('target user not found');
          resolve();
        }
      });
      const controller = handler(socket, {});
      controller({ user_list_id: 'nonexistent' });
    });
  });

  it('should emit error when trying to silence an admin', async () => {
    const getRoomByName = sinon.stub().resolves({
      users: [
        { _id: 'target_list_id', handle: 'admin', socket_id: 'target_socket', isAdmin: true, isSiteMod: false },
      ],
    });
    const handler = await createHandler({ getRoomByName });

    await new Promise((resolve) => {
      const socket = socketMock((msg, data) => {
        if (msg === 'client::error') {
          expect(data.message).to.equal('You can not silence an admin');
          resolve();
        }
      });
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_list_id' });
    });
  });

  it('should emit error when trying to silence a site moderator', async () => {
    const getRoomByName = sinon.stub().resolves({
      users: [
        { _id: 'target_list_id', handle: 'sitemod', socket_id: 'target_socket', isAdmin: false, isSiteMod: true },
      ],
    });
    const handler = await createHandler({ getRoomByName });

    await new Promise((resolve) => {
      const socket = socketMock((msg, data) => {
        if (msg === 'client::error') {
          expect(data.message).to.equal('You can not silence a site moderator');
          resolve();
        }
      });
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_list_id' });
    });
  });

  it('should silence user and emit status messages', async () => {
    const handler = await createHandler();

    const emittedEvents = [];
    const io = {
      to: sinon.stub().returns({
        emit: (msg, data) => emittedEvents.push({ msg, data }),
      }),
    };

    const socket = socketMock(sinon.spy());
    const controller = handler(socket, io);
    await controller({ user_list_id: 'target_list_id' });

    // Should emit to target user and to room
    expect(emittedEvents.length).to.be.at.least(2);
    const targetMsg = emittedEvents.find(e => e.data && e.data.message && e.data.message.includes('You have been silenced'));
    const roomMsg = emittedEvents.find(e => e.data && e.data.message && e.data.message.includes('was silenced'));
    expect(targetMsg).to.not.be.undefined;
    expect(roomMsg).to.not.be.undefined;
  });
});
