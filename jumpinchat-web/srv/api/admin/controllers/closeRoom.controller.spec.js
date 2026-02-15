import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('closeRoom.controller', () => {
  let closeRoom;
  let req;
  let res;
  let closeRoomStub;
  let addModActivityStub;

  function createRes() {
    return {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  beforeEach(async () => {
    closeRoomStub = sinon.stub().resolves({ _id: 'close123' });
    addModActivityStub = sinon.stub().resolves();

    const mod = await esmock('./closeRoom.controller.js', {
      '../../../utils/logger.util.js': { default: () => ({ debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), fatal: sinon.stub() }) },
      '../../../config/constants/errors.js': { default: { ERR_SRV: { code: 'ERR_SRV', message: 'server error' } } },
      '../../roomClose/roomClose.utils.js': { default: { closeRoom: closeRoomStub } },
      '../admin.utils.js': { default: { addModActivity: addModActivityStub } },
      '../admin.constants.js': { default: { activity: { ROOM_CLOSE: 'RoomClose' } } },
    });

    closeRoom = mod.default;
    res = createRes();
    req = {
      params: { roomName: 'testroom' },
      body: { reason: 'violation', duration: 24 },
      user: { _id: 'admin123' },
    };
  });

  describe('happy path', () => {
    it('should close the room and return 201', async () => {
      await closeRoom(req, res);

      expect(closeRoomStub.calledOnce).to.equal(true);
      expect(res.status.calledWith(201)).to.equal(true);
    });

    it('should pass roomName, reason, and duration to closeRoom util', async () => {
      await closeRoom(req, res);

      expect(closeRoomStub.firstCall.args[0]).to.equal('testroom');
      expect(closeRoomStub.firstCall.args[1]).to.equal('violation');
      expect(closeRoomStub.firstCall.args[2]).to.equal(24);
    });

    it('should return the new close record in the response', async () => {
      await closeRoom(req, res);

      expect(res.send.firstCall.args[0]).to.deep.equal({ _id: 'close123' });
    });

    it('should add mod activity after closing room', async () => {
      await closeRoom(req, res);

      expect(addModActivityStub.calledOnce).to.equal(true);
      expect(addModActivityStub.firstCall.args[0]).to.equal('admin123');
      expect(addModActivityStub.firstCall.args[1]).to.deep.equal({
        type: 'RoomClose',
        id: 'close123',
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 with ERR_SRV if closeRoom fails', async () => {
      closeRoomStub.rejects(new Error('close failed'));

      await closeRoom(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
      expect(res.send.firstCall.args[0]).to.deep.equal({ code: 'ERR_SRV', message: 'server error' });
    });

    it('should return 500 if addModActivity fails', async () => {
      addModActivityStub.rejects(new Error('activity error'));

      await closeRoom(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });
  });
});
