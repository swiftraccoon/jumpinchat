/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('Disconnect user socket', () => {
  let socket;
  const socketEmitSpy = sinon.spy();
  const ioEmitSpy = sinon.spy();

  const socketMock = (emit = socketEmitSpy) => ({
    id: 'foo',
    emit,
  });

  const ioMock = (emit = ioEmitSpy) => ({
    to: sinon.stub().returns({
      emit,
    }),
  });

  const leaveRoom = sinon.stub().yields(null, 'foo', {
    handle: 'handle',
  });
  const filterRoomUser = sinon.stub().callsFake(u => u);
  const messageFactory = sinon.stub().callsFake(m => m);

  beforeEach(async function beforeEach() {
    this.timeout(5000);

    socket = await esmock('../../sockets/disconnectUser.socket.js', {
      '../../room.controller.js': {
        leaveRoom,
      },
      '../../../../utils/utils.js': {
        messageFactory,
      },
      '../../room.utils.js': {
        filterRoomUser,
      },
    });
  });

  it('should emit a status message', (done) => {
    const emit = (msg, data) => {
      if (msg === 'room::status') {
        expect(messageFactory.getCall(0).args[0]).to.eql({
          message: 'handle has left the room',
        });

        done();
      }
    };

    const controller = socket(socketMock(), ioMock(emit));

    controller();
  });

  it('should emit a disconnect message to room', (done) => {
    const emit = (msg, data) => {
      if (msg === 'room::disconnect') {
        expect(data).to.eql({
          user: { handle: 'handle' },
        });

        done();
      }
    };

    const controller = socket(socketMock(), ioMock(emit));

    controller();
  });
});
