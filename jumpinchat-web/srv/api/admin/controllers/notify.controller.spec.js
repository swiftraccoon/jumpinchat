import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('notify.controller', () => {
  let notify;
  let io;

  beforeEach(async () => {
    const mod = await esmock('./notify.controller.js', {
      '../../../utils/logger.util.js': { default: () => ({ debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), fatal: sinon.stub() }) },
      '../../../utils/utils.js': { default: { messageFactory: (msg) => ({ ...msg, id: 'test-id', timestamp: new Date() }) } },
    });

    notify = mod.default;

    io = {
      emit: sinon.stub(),
      to: sinon.stub().returns({ emit: sinon.stub() }),
    };
  });

  describe('when io is not set', () => {
    it('should return an error via callback', (done) => {
      notify(null, { message: 'test', type: 'INFO' }, (err) => {
        expect(err).to.be.an.instanceOf(Error);
        expect(err.message).to.equal('socket io not set');
        done();
      });
    });
  });

  describe('when io is set', () => {
    it('should emit a room::status event to all sockets when no room specified', (done) => {
      const body = { message: 'Server restarting', type: 'WARNING' };

      notify(io, body, (err) => {
        expect(err).to.equal(null);
        expect(io.emit.calledOnce).to.equal(true);
        expect(io.emit.firstCall.args[0]).to.equal('room::status');

        const message = io.emit.firstCall.args[1];
        expect(message.context).to.equal('chat');
        expect(message.message).to.equal('Server restarting');
        expect(message.type).to.equal('warning');
        done();
      });
    });

    it('should emit to a specific room when room is specified', (done) => {
      const body = { message: 'Room notice', type: 'INFO', room: 'testroom' };
      const roomEmitStub = sinon.stub();
      io.to.returns({ emit: roomEmitStub });

      notify(io, body, (err) => {
        expect(err).to.equal(null);
        expect(io.to.calledWith('testroom')).to.equal(true);
        expect(roomEmitStub.calledOnce).to.equal(true);
        expect(roomEmitStub.firstCall.args[0]).to.equal('room::status');

        const message = roomEmitStub.firstCall.args[1];
        expect(message.message).to.equal('Room notice');
        expect(message.type).to.equal('info');
        done();
      });
    });

    it('should lowercase the notification type', (done) => {
      const body = { message: 'Test', type: 'ALERT' };

      notify(io, body, (err) => {
        expect(err).to.equal(null);
        const message = io.emit.firstCall.args[1];
        expect(message.type).to.equal('alert');
        done();
      });
    });
  });
});
