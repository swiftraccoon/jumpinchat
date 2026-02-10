/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('Private message socket', () => {
  let socket;
  const socketEmitSpy = sinon.spy();
  const ioEmitSpy = sinon.spy();

  const socketMock = (emit = socketEmitSpy) => ({
    id: 'foo',
    emit,
  });

  const ioMockTo = sinon.stub().callsFake(emit => ({
    emit,
  }));

  const ioMock = (emit = ioEmitSpy) => ({
    to: socketId => ioMockTo(emit, socketId),
  });

  const getSocketCacheInfo = sinon.stub().yields(null, {
    handle: 'foo',
    color: '#000000',
    userListId: '123',
  });

  let privateMessage;

  const messageFactory = sinon.stub().callsFake(msg => msg);
  const setSocketIdByListId = sinon.stub().yields();

  const defaultControllerOpts = {
    pm: {
      error: null,
      socketId: 'socketid',
    },
  };

  const createController = async (opts = defaultControllerOpts) => {
    privateMessage = sinon.stub()
      .yields(opts.pm.error, opts.pm.socketId);

    return await esmock('../../sockets/privateMessage.socket.js', {
      '../../room.utils.js': {
        getSocketCacheInfo,
        setSocketIdByListId,
      },
      '../../controllers/room.privateMessage.js': privateMessage,
      '../../../../utils/utils.js': {
        messageFactory,
      },
      '../../utils/room.utils.sendPush.js': sinon.spy(),
      '../../../../utils/socketFloodProtect.js': sinon.stub().resolves(),
    });
  };

  beforeEach(function beforeEach() {
    this.timeout(5000);
  });

  it('should emit a message to target socket', async () => {
    socket = await createController();
    await new Promise((resolve) => {
      const emit = (msg, body) => {
        if (msg === 'room::privateMessage') {
          expect(body.message).to.equal('foo');
          resolve();
        }
      };

      const controller = socket(socketMock(), ioMock(emit));
      controller({ user_list_id: '1234', message: 'foo' });
    });
  });

  it('should emit a message to sender socket', async () => {
    socket = await createController();
    await new Promise((resolve) => {
      const emit = (msg, body) => {
        if (msg === 'room::privateMessage') {
          expect(body.message).to.equal('foo');
          expect(body.clientIsSender).to.equal(true);
          resolve();
        }
      };

      const controller = socket(socketMock(emit), ioMock());
      controller({ user_list_id: '1234', message: 'foo' });
    });
  });
});
