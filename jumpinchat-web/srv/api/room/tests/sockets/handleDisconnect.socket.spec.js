import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('handleDisconnect socket', () => {
  const socketEmitSpy = sinon.spy();

  const socketMock = (emit = socketEmitSpy) => ({
    id: 'socket_1',
    emit,
  });

  const ioEmitSpy = sinon.spy();
  const ioMock = (emit = ioEmitSpy) => ({
    to: sinon.stub().returns({ emit }),
  });

  const createHandler = async (overrides = {}) => {
    const leaveRoom = overrides.leaveRoom || sinon.stub().yields(null, 'testroom', {
      handle: 'testuser',
      socket_id: 'socket_1',
    });
    const filterRoomUser = overrides.filterRoomUser || sinon.stub().callsFake(u => u);
    const messageFactory = overrides.messageFactory || sinon.stub().callsFake(m => m);

    return esmock('../../sockets/handleDisconnect.socket.js', {
      '../../room.controller.js': {
        default: { leaveRoom },
      },
      '../../room.utils.js': {
        default: { filterRoomUser },
      },
      '../../../../utils/utils.js': {
        default: { messageFactory },
      },
    });
  };

  it('should emit status message when user disconnects', async () => {
    const messageFactory = sinon.stub().callsFake(m => m);
    const handler = await createHandler({ messageFactory });
    await new Promise((resolve) => {
      const emit = (msg, data) => {
        if (msg === 'room::status') {
          expect(messageFactory.firstCall.args[0].message).to.equal('testuser has left the room');
          resolve();
        }
      };
      const controller = handler(socketMock(), ioMock(emit));
      controller();
    });
  });

  it('should emit room::disconnect with filtered user', async () => {
    const filterRoomUser = sinon.stub().callsFake(u => ({ handle: u.handle }));
    const handler = await createHandler({ filterRoomUser });
    await new Promise((resolve) => {
      const emit = (msg, data) => {
        if (msg === 'room::disconnect') {
          expect(data.user.handle).to.equal('testuser');
          expect(filterRoomUser.called).to.equal(true);
          resolve();
        }
      };
      const controller = handler(socketMock(), ioMock(emit));
      controller();
    });
  });

  it('should not emit if leaveRoom returns error', async () => {
    const leaveRoom = sinon.stub().yields(new Error('fail'));
    const handler = await createHandler({ leaveRoom });
    const emit = sinon.spy();
    const controller = handler(socketMock(), ioMock(emit));
    controller();
    // Give it a tick to settle
    await new Promise(r => setTimeout(r, 10));
    expect(emit.called).to.equal(false);
  });

  it('should not emit if leaveRoom returns no user', async () => {
    const leaveRoom = sinon.stub().yields(null, 'testroom', null);
    const handler = await createHandler({ leaveRoom });
    const emit = sinon.spy();
    const controller = handler(socketMock(), ioMock(emit));
    controller();
    await new Promise(r => setTimeout(r, 10));
    expect(emit.called).to.equal(false);
  });
});
