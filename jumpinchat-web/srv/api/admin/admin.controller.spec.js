import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('admin.controller', () => {
  let controller;
  let notifyStub;
  let res;

  function createRes() {
    return {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  beforeEach(async () => {
    notifyStub = sinon.stub();

    const mod = await esmock('./admin.controller.js', {
      '../../utils/logger.util.js': { default: () => ({ debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), fatal: sinon.stub() }) },
      './controllers/notify.controller.js': { default: notifyStub },
      './controllers/notifyServerRestart.controller.js': { default: sinon.stub() },
      './controllers/getActiveRooms.controller.js': { default: sinon.stub() },
      './controllers/getRoomById.controller.js': { default: sinon.stub() },
      './controllers/getUserList.controller.js': { default: sinon.stub() },
    });

    controller = mod;
    res = createRes();
  });

  describe('setSocketIo / getSocketIo', () => {
    it('should store and retrieve the io instance', () => {
      const fakeIo = { emit: sinon.stub() };
      controller.setSocketIo(fakeIo);
      expect(controller.getSocketIo()).to.equal(fakeIo);
    });
  });

  describe('notify', () => {
    it('should return 400 if message is missing', () => {
      const req = { body: { type: 'INFO' } };

      controller.notify(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
    });

    it('should return 400 if type is missing', () => {
      const req = { body: { message: 'test' } };

      controller.notify(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
    });

    it('should return 400 if type is not a valid value', () => {
      const req = { body: { message: 'test', type: 'INVALID' } };

      controller.notify(req, res);

      expect(res.status.calledWith(400)).to.equal(true);
    });

    it('should accept valid types: INFO, SUCCESS, ALERT, WARNING', () => {
      const fakeIo = { emit: sinon.stub() };
      controller.setSocketIo(fakeIo);
      notifyStub.callsFake((io, body, cb) => cb(null));

      ['INFO', 'SUCCESS', 'ALERT', 'WARNING'].forEach((type) => {
        res = createRes();
        const req = { body: { message: 'test', type } };
        controller.notify(req, res);
        expect(res.status.calledWith(200)).to.equal(true);
      });
    });

    it('should return 500 if socket.io is not connected', () => {
      controller.setSocketIo(null);
      const req = { body: { message: 'test', type: 'INFO' } };

      controller.notify(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });

    it('should call _notify with io and validated body', () => {
      const fakeIo = { emit: sinon.stub() };
      controller.setSocketIo(fakeIo);
      notifyStub.callsFake((io, body, cb) => cb(null));

      const req = { body: { message: 'Hello world', type: 'INFO' } };
      controller.notify(req, res);

      expect(notifyStub.calledOnce).to.equal(true);
      expect(notifyStub.firstCall.args[0]).to.equal(fakeIo);
      expect(notifyStub.firstCall.args[1].message).to.equal('Hello world');
      expect(notifyStub.firstCall.args[1].type).to.equal('INFO');
    });

    it('should return 500 if _notify returns an error', () => {
      const fakeIo = { emit: sinon.stub() };
      controller.setSocketIo(fakeIo);
      notifyStub.callsFake((io, body, cb) => cb(new Error('notify failed')));

      const req = { body: { message: 'test', type: 'INFO' } };
      controller.notify(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });

    it('should accept an optional room field', () => {
      const fakeIo = { emit: sinon.stub() };
      controller.setSocketIo(fakeIo);
      notifyStub.callsFake((io, body, cb) => cb(null));

      const req = { body: { message: 'test', type: 'INFO', room: 'myroom' } };
      controller.notify(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
      expect(notifyStub.firstCall.args[1].room).to.equal('myroom');
    });
  });
});
