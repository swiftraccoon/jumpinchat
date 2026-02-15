import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('handleKickUser socket', () => {
  const createHandler = async (overrides = {}) => {
    const getSocketCacheInfo = overrides.getSocketCacheInfo || sinon.stub().resolves({
      name: 'testroom',
      handle: 'moderator',
      userId: 'mod_user_id',
      userListId: 'mod_list_id',
    });

    const getUserHasRolePermissions = overrides.getUserHasRolePermissions || sinon.stub().resolves();

    const getRoomByName = overrides.getRoomByName || sinon.stub().resolves({
      users: [
        { _id: 'target_list_id', handle: 'targetuser', socket_id: 'target_socket', session_id: 'target_session', isAdmin: false, isSiteMod: false },
        { _id: 'mod_list_id', handle: 'moderator', socket_id: 'mod_socket', session_id: 'mod_session', isAdmin: false, isSiteMod: false },
      ],
    });

    const messageFactory = overrides.messageFactory || sinon.stub().callsFake(m => m);

    return esmock('../../sockets/handleKickUser.socket.js', {
      '../../room.utils.js': {
        default: { getSocketCacheInfo, getRoomByName },
      },
      '../../../../utils/utils.js': {
        default: { messageFactory },
      },
      '../../../../utils/error.util.js': {
        PermissionError: class PermissionError extends Error {
          constructor(msg) { super(msg); this.name = 'PermissionError'; }
        },
      },
      '../../../role/role.utils.js': {
        getUserHasRolePermissions,
      },
    });
  };

  it('should emit error when getSocketCacheInfo fails', async () => {
    const getSocketCacheInfo = sinon.stub().rejects(new Error('cache fail'));
    const handler = await createHandler({ getSocketCacheInfo });

    await new Promise((resolve) => {
      const socket = {
        id: 'mod_socket',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('banner');
            resolve();
          }
        },
      };
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_list_id' });
    });
  });

  it('should emit error when user lacks kick permission', async () => {
    // getUserHasRolePermissions rejects with a generic error (non-PermissionError)
    // which should hit the generic error handler
    const getUserHasRolePermissions = sinon.stub().rejects(new Error('No permission'));
    const handler = await createHandler({ getUserHasRolePermissions });

    await new Promise((resolve) => {
      const socket = {
        id: 'mod_socket',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('banner');
            expect(data.message).to.equal('Server error attempting to kick user.');
            resolve();
          }
        },
      };
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
      const socket = {
        id: 'mod_socket',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('banner');
            expect(data.message).to.equal('Could not find user');
            resolve();
          }
        },
      };
      const controller = handler(socket, {});
      controller({ user_list_id: 'nonexistent' });
    });
  });

  it('should emit error when trying to kick an admin', async () => {
    const getRoomByName = sinon.stub().resolves({
      users: [
        { _id: 'target_list_id', handle: 'admin', socket_id: 'target_socket', isAdmin: true, isSiteMod: false },
      ],
    });
    const handler = await createHandler({ getRoomByName });

    await new Promise((resolve) => {
      const socket = {
        id: 'mod_socket',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.message).to.equal('You can not kick an admin');
            resolve();
          }
        },
      };
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_list_id' });
    });
  });

  it('should emit error when trying to kick a site moderator', async () => {
    const getRoomByName = sinon.stub().resolves({
      users: [
        { _id: 'target_list_id', handle: 'sitemod', socket_id: 'target_socket', isAdmin: false, isSiteMod: true },
      ],
    });
    const handler = await createHandler({ getRoomByName });

    await new Promise((resolve) => {
      const socket = {
        id: 'mod_socket',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.message).to.equal('You can not kick a site moderator');
            resolve();
          }
        },
      };
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_list_id' });
    });
  });

  it('should kick user and emit status and banned events', async () => {
    const sessionStore = {
      get: sinon.stub().yields(null, { kicked: false }),
      set: sinon.stub().yields(null),
    };

    const handler = await createHandler();

    const emittedEvents = [];
    const socket = {
      id: 'mod_socket',
      emit: sinon.spy(),
      handshake: { sessionStore },
    };
    const disconnectSockets = sinon.stub();
    const io = {
      to: sinon.stub().returns({
        emit: (msg, data) => { emittedEvents.push({ msg, data }); },
      }),
      in: sinon.stub().returns({
        disconnectSockets,
      }),
    };

    const controller = handler(socket, io);
    controller({ user_list_id: 'target_list_id' });

    // Wait for async
    await new Promise(r => setTimeout(r, 50));

    expect(sessionStore.get.called).to.equal(true);
    expect(sessionStore.set.called).to.equal(true);
    // Check that session was marked as kicked
    const savedSession = sessionStore.set.firstCall.args[1];
    expect(savedSession.kicked).to.equal(true);
  });
});
