import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('handleCloseBroadcast socket', () => {
  const createHandler = async (overrides = {}) => {
    const getSocketCacheInfo = overrides.getSocketCacheInfo || sinon.stub().resolves({
      name: 'testroom',
      handle: 'moderator',
      userId: 'mod_user_id',
    });

    const getUserHasRolePermissions = overrides.getUserHasRolePermissions || sinon.stub().resolves();

    const closeBroadcast = overrides.closeBroadcast || sinon.stub().yields(null, {
      handle: 'broadcaster',
      socket_id: 'broadcaster_socket',
    });

    const messageFactory = sinon.stub().callsFake(m => m);

    return esmock('../../sockets/handleCloseBroadcast.socket.js', {
      '../../room.utils.js': {
        default: { getSocketCacheInfo },
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
      },
      '../../../role/role.utils.js': {
        getUserHasRolePermissions,
      },
      '../../controllers/moderation/room.closeBroadcast.controller.js': {
        default: closeBroadcast,
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
      controller({ user_list_id: 'target_id' });
    });
  });

  it('should emit error when user lacks closeCam permission', async () => {
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
      controller({ user_list_id: 'target_id' });
    });
  });

  it('should emit error when closeBroadcast fails', async () => {
    const closeBroadcast = sinon.stub().yields({ err: 'fail', message: 'close failed' });
    const handler = await createHandler({ closeBroadcast });

    await new Promise((resolve) => {
      const socket = socketMock((msg, data) => {
        if (msg === 'client::error') {
          expect(data.context).to.equal('chat');
          resolve();
        }
      });
      const controller = handler(socket, {});
      controller({ user_list_id: 'target_id' });
    });
  });

  it('should emit closeBroadcast and status messages on success', async () => {
    const handler = await createHandler();

    const emittedEvents = [];
    const io = {
      to: sinon.stub().returns({
        emit: (msg, data) => emittedEvents.push({ msg, data }),
      }),
    };

    const socket = socketMock(sinon.spy());
    const controller = handler(socket, io);
    await controller({ user_list_id: 'target_id' });

    // Wait for callback
    await new Promise(r => setTimeout(r, 20));

    const closeEvt = emittedEvents.find(e => e.msg === 'self::closeBroadcast');
    expect(closeEvt).to.not.be.undefined;

    const statusMsgs = emittedEvents.filter(e => e.msg === 'room::status');
    expect(statusMsgs.length).to.be.at.least(1);
    const roomNotice = statusMsgs.find(e => e.data && e.data.message && e.data.message.includes('has closed'));
    expect(roomNotice).to.not.be.undefined;
  });
});
