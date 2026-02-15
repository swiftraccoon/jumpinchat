import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('handleClearFeed socket', () => {
  const createHandler = async (overrides = {}) => {
    const getSocketCacheInfo = overrides.getSocketCacheInfo || sinon.stub().resolves({
      name: 'testroom',
      handle: 'moderator',
      userId: 'mod_user_id',
    });

    const getUserHasRolePermissions = overrides.getUserHasRolePermissions || sinon.stub().resolves();

    const messageFactory = sinon.stub().callsFake(m => m);

    return esmock('../../sockets/handleClearFeed.socket.js', {
      '../../room.utils.js': {
        default: { getSocketCacheInfo },
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
      controller();
    });
  });

  it('should emit error when user lacks ban permission', async () => {
    // Use a generic error (non-PermissionError) to test the generic error path
    const getUserHasRolePermissions = sinon.stub().rejects(new Error('No permission'));
    const handler = await createHandler({ getUserHasRolePermissions });

    await new Promise((resolve) => {
      const socket = {
        id: 'mod_socket',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('banner');
            expect(data.message).to.equal('Server error attempting to clear feed.');
            resolve();
          }
        },
      };
      const controller = handler(socket, {});
      controller();
    });
  });

  it('should emit clearFeed and status message on success', async () => {
    const handler = await createHandler();

    const emittedEvents = [];
    const io = {
      to: sinon.stub().returns({
        emit: (msg, data) => emittedEvents.push({ msg, data }),
      }),
    };

    const socket = { id: 'mod_socket', emit: sinon.spy() };
    const controller = handler(socket, io);
    await controller();

    const clearFeed = emittedEvents.find(e => e.msg === 'room::clearFeed');
    expect(clearFeed).to.not.be.undefined;

    const status = emittedEvents.find(e => e.msg === 'room::status');
    expect(status).to.not.be.undefined;
    expect(status.data.message).to.equal('moderator cleared the chat feed');
  });
});
