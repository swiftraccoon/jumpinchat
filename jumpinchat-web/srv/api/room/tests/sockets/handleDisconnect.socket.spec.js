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

    return esmock.strict('../../sockets/handleDisconnect.socket.js', {
      '../../room.controller.js': {
        default: { leaveRoom },
      },
      '../../room.utils.js': {
        default: {
          filterRoomUser,
          getSocketCacheInfo: overrides.getSocketCacheInfo || sinon.stub().resolves({ name: 'testroom' }),
          getRoomByName: overrides.getRoomByName || sinon.stub().resolves({ users: [{ socket_id: 'socket_1' }] }),
        },
      },
      '../../../../utils/socketRecovery.util.js': {
        markSocketRecoverable: overrides.markSocketRecoverable || sinon.stub().resolves(1),
        RECONNECT_GRACE_MS: 60000,
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
  for (const reason of ['transport close', 'transport error', 'ping timeout']) {
    it(`retains room/media for 60 seconds after ${reason}`, async () => {
      const leaveRoom = sinon.stub().yields(null, 'testroom', { handle: 'guest' });
      const markSocketRecoverable = sinon.stub().resolves(1);
      const handler = await createHandler({ leaveRoom, markSocketRecoverable });
      const clock = sinon.useFakeTimers();
      try {
        await handler(socketMock(), ioMock())(reason);
        expect(markSocketRecoverable.calledWith('socket_1')).to.equal(true);
        await clock.tickAsync(59999);
        expect(leaveRoom.called).to.equal(false);
        await clock.tickAsync(1);
        expect(leaveRoom.calledOnce).to.equal(true);
      } finally { clock.restore(); }
    });
  }

  for (const reason of ['client namespace disconnect', 'server namespace disconnect']) {
    it(`cleans up immediately after ${reason}`, async () => {
      const leaveRoom = sinon.stub().yields(null, 'testroom', { handle: 'guest' });
      const markSocketRecoverable = sinon.stub().resolves(1);
      const handler = await createHandler({ leaveRoom, markSocketRecoverable });
      await handler(socketMock(), ioMock())(reason);
      expect(leaveRoom.calledOnce).to.equal(true);
      expect(markSocketRecoverable.called).to.equal(false);
    });
  }

  it('skips expired cleanup after successful migration removes the old cache', async () => {
    const leaveRoom = sinon.spy();
    const handler = await createHandler({ leaveRoom, getSocketCacheInfo: sinon.stub().resolves(null) });
    const clock = sinon.useFakeTimers();
    try {
      await handler(socketMock(), ioMock())('transport close');
      await clock.tickAsync(60000);
      expect(leaveRoom.called).to.equal(false);
    } finally { clock.restore(); }
  });

  it('skips cleanup when the member moved but deletion of the old cache is still pending', async () => {
    const leaveRoom = sinon.spy();
    const handler = await createHandler({ leaveRoom, getRoomByName: sinon.stub().resolves({ users: [{ socket_id: 'new_socket' }] }) });
    const clock = sinon.useFakeTimers();
    try {
      await handler(socketMock(), ioMock())('transport close');
      await clock.tickAsync(60000);
      expect(leaveRoom.called).to.equal(false);
    } finally { clock.restore(); }
  });

});
