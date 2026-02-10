/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('Handle ban user socket', () => {
  let socket;
  const socketEmitSpy = sinon.spy();
  const ioEmitSpy = sinon.spy();

  const socketMock = (emit = socketEmitSpy) => ({
    id: 'foo',
    emit,
  });

  const disconnectSocketSpy = sinon.spy();
  const ioMockTo = sinon.stub().callsFake(emit => ({
    emit,
  }));

  const ioMock = (emit = ioEmitSpy) => ({
    to: socketId => ioMockTo(emit, socketId),
    in: sinon.stub().returns({
      disconnectSockets: sinon.stub(),
    }),
  });

  const getSocketCacheInfo = sinon.stub().resolves({
    handle: 'foo',
    color: '#000000',
    userListId: '123',
  });

  let checkOperatorPermissions;
  let banUser;

  const messageFactory = sinon.stub().callsFake(msg => msg);

  const defaultControllerOpts = {
    banUser: {
      error: null,
      user: {
        handle: 'mod',
        socket_id: 'foo',
      },
    },
    operatorPermissions: true,
  };

  const createController = async (opts = defaultControllerOpts) => {
    checkOperatorPermissions = sinon.stub().yields(null, opts.operatorPermissions);
    banUser = sinon.stub().yields(opts.banUser.error, opts.banUser.user);

    return await esmock('../../sockets/handleBanUser.socket.js', {
      '../../room.utils.js': {
        getSocketCacheInfo,
        checkOperatorPermissions,
      },
      '../../room.controller.js': {
        banUser,
      },
      '../../../../utils/utils.js': {
        messageFactory,
      },
    });
  };

  beforeEach(function beforeEach() {
    this.timeout(5000);
  });

  it('should emit error on self ban', async () => {
    const opts = Object.assign({}, defaultControllerOpts, {
      banUser: {
        error: 'ERR_SELF_BAN',
      },
    });
    socket = await createController(opts);
    await new Promise((resolve) => {
      const emit = (msg, body) => {
        if (msg === 'client::error') {
          expect(body.context).to.equal('banner');
          expect(body.message).to.equal('You can not ban yourself');
          resolve();
        }
      };
      const controller = socket(socketMock(emit));
      controller({ user_list_id: '1234' });
    });
  });

  it('should emit error on owner ban', async () => {
    const opts = Object.assign({}, defaultControllerOpts, {
      banUser: {
        error: 'ERR_BAN_OWNER',
      },
    });
    socket = await createController(opts);
    await new Promise((resolve) => {
      const emit = (msg, body) => {
        if (msg === 'client::error') {
          expect(body.context).to.equal('chat');
          expect(body.message).to.equal('You can not ban the room owner');
          resolve();
        }
      };
      const controller = socket(socketMock(emit));
      controller({ user_list_id: '1234' });
    });
  });

  it('should emit error on perm op ban', async () => {
    const opts = Object.assign({}, defaultControllerOpts, {
      banUser: {
        error: 'ERR_BAN_PERM_OP',
      },
    });
    socket = await createController(opts);
    await new Promise((resolve) => {
      const emit = (msg, body) => {
        if (msg === 'client::error') {
          expect(body.context).to.equal('chat');
          expect(body.message).to.equal('You can not ban a moderator');
          resolve();
        }
      };
      const controller = socket(socketMock(emit));
      controller({ user_list_id: '1234' });
    });
  });

  it('should emit error on admin ban', async () => {
    const opts = Object.assign({}, defaultControllerOpts, {
      banUser: {
        error: 'ERR_BAN_ADMIN',
      },
    });
    socket = await createController(opts);
    await new Promise((resolve) => {
      const emit = (msg, body) => {
        if (msg === 'client::error') {
          expect(body.context).to.equal('chat');
          expect(body.message).to.equal('You can not ban an admin');
          resolve();
        }
      };
      const controller = socket(socketMock(emit));
      controller({ user_list_id: '1234' });
    });
  });

  it('should emit banned event to the target socket', async () => {
    socket = await createController();
    await new Promise((resolve) => {
      const emit = (msg) => {
        if (msg === 'self::banned') {
          resolve();
        }
      };
      const controller = socket(socketMock(), ioMock(emit));
      controller({ user_list_id: '1234' });
    });
  });

  it('should emit banned event to the room', async () => {
    socket = await createController();
    await new Promise((resolve) => {
      const emit = (msg, body) => {
        if (msg === 'room::userbanned') {
          expect(body).to.eql({
            user: {
              handle: 'mod',
              socket_id: 'foo',
            },
          });
          resolve();
        }
      };
      const controller = socket(socketMock(), ioMock(emit));
      controller({ user_list_id: '1234' });
    });
  });
});
