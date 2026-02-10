/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('Change Handle Socket', () => {
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

  const changeHandleResult = {
    uuid: '123',
    newHandle: 'bar',
    oldHandle: 'foo',
  };

  const changeHandle = sinon.stub().yields(null, changeHandleResult);

  beforeEach(async function beforeEach() {
    this.timeout(5000);

    socket = await esmock('../../sockets/changeHandle.socket.js', {
      '../../room.controller.js': {
        changeHandle,
      },
      '../../../../utils/utils.js': {
        messageFactory: sinon.stub().returns(),
      },
      '../../../../utils/socketFloodProtect.js': sinon.stub().returns(Promise.resolve()),
    });
  });

  it('should emit a `handleChange` event to client', (done) => {
    const emit = (msg, body) => {
      if (msg === 'client::handleChange') {
        expect(body).to.eql({ handle: 'bar' });
        return done();
      }

      throw new Error('wrong socket message');
    };
    const controller = socket(socketMock(emit), ioMock());
    controller({ handle: 'bar' });
  });

  it('should emit a `handleChange` event to room', (done) => {
    const emit = (msg, body) => {
      if (msg === 'room::handleChange') {
        expect(body).to.eql({ handle: 'bar', userId: '123' });
        done();
      }
    };
    const controller = socket(socketMock(), ioMock(emit));
    controller({ handle: 'bar' });
  });

  it('should emit a `status` event to room', (done) => {
    const emit = (msg, body) => {
      if (msg === 'room::status') {
        done();
      }
    };
    const controller = socket(socketMock(), ioMock(emit));
    controller({ handle: 'bar' });
  });
});
