import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('getRoomUsers socket', () => {
  const createHandler = async (overrides = {}) => {
    const getSocketCacheInfo = overrides.getSocketCacheInfo || sinon.stub().resolves({
      name: 'testroom',
    });

    const getRoomByName = overrides.getRoomByName || sinon.stub().resolves({
      users: [
        { _id: 'user1', handle: 'alice', socket_id: 's1' },
        { _id: 'user2', handle: 'bob', socket_id: 's2' },
      ],
    });

    const filterRoomUser = overrides.filterRoomUser || sinon.stub().callsFake(u => ({ handle: u.handle }));
    const messageFactory = sinon.stub().callsFake(m => m);

    return esmock('../../sockets/getRoomUsers.socket.js', {
      '../../room.utils.js': {
        getSocketCacheInfo,
        getRoomByName,
        filterRoomUser,
      },
      '../../../../utils/utils.js': {
        default: { messageFactory },
      },
      '../../../../config/constants/errors.js': {
        default: {
          ERR_NO_USER_SESSION: { code: 'ERR_NO_USER_SESSION', message: 'no user session' },
          ERR_SRV: { code: 'ERR_SRV', message: 'server error' },
          ERR_NO_ROOM: { code: 'ERR_NO_ROOM', message: 'room does not exist' },
        },
      },
    });
  };

  it('should emit error when getSocketCacheInfo fails', async () => {
    const getSocketCacheInfo = sinon.stub().rejects(new Error('cache fail'));
    const handler = await createHandler({ getSocketCacheInfo });

    await new Promise((resolve) => {
      const socket = {
        id: 'socket_1',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('banner');
            resolve();
          }
        },
      };
      const controller = handler(socket);
      controller();
    });
  });

  it('should emit error when socketData is null', async () => {
    const getSocketCacheInfo = sinon.stub().resolves(null);
    const handler = await createHandler({ getSocketCacheInfo });

    await new Promise((resolve) => {
      const socket = {
        id: 'socket_1',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('chat');
            resolve();
          }
        },
      };
      const controller = handler(socket);
      controller();
    });
  });

  it('should emit error when getRoomByName fails', async () => {
    const getRoomByName = sinon.stub().rejects(new Error('db error'));
    const handler = await createHandler({ getRoomByName });

    await new Promise((resolve) => {
      const socket = {
        id: 'socket_1',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('banner');
            resolve();
          }
        },
      };
      const controller = handler(socket);
      controller();
    });
  });

  it('should emit error when room is null', async () => {
    const getRoomByName = sinon.stub().resolves(null);
    const handler = await createHandler({ getRoomByName });

    await new Promise((resolve) => {
      const socket = {
        id: 'socket_1',
        emit: (msg, data) => {
          if (msg === 'client::error') {
            expect(data.context).to.equal('banner');
            resolve();
          }
        },
      };
      const controller = handler(socket);
      controller();
    });
  });

  it('should emit room::updateUsers with filtered users on success', async () => {
    const handler = await createHandler();

    await new Promise((resolve) => {
      const socket = {
        id: 'socket_1',
        emit: (msg, data) => {
          if (msg === 'room::updateUsers') {
            expect(data.users).to.have.length(2);
            expect(data.users[0].handle).to.equal('alice');
            expect(data.users[1].handle).to.equal('bob');
            resolve();
          }
        },
      };
      const controller = handler(socket);
      controller();
    });
  });
});
