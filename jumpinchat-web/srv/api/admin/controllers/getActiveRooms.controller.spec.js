import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('getActiveRooms.controller', () => {
  let getActiveRooms;
  let req;
  let res;
  let getActiveRoomCountStub;
  let getActiveRoomsStub;

  const mockRooms = [
    { name: 'room1', users: [{ handle: 'alice' }] },
    { name: 'room2', users: [{ handle: 'bob' }, { handle: 'carol' }] },
  ];

  function createRes() {
    return {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  beforeEach(async () => {
    getActiveRoomCountStub = sinon.stub().resolves(25);
    getActiveRoomsStub = sinon.stub();

    const mod = await esmock('./getActiveRooms.controller.js', {
      '../../../utils/logger.util.js': { default: () => ({ debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), fatal: sinon.stub() }) },
      '../../../config/env/index.js': { default: { admin: { userList: { itemsPerPage: 10 } } } },
      '../../room/room.utils.js': { default: { getActiveRoomCount: getActiveRoomCountStub, getActiveRooms: getActiveRoomsStub } },
    });

    getActiveRooms = mod.default;
    res = createRes();
    req = { query: { page: 1 } };
  });

  describe('happy path', () => {
    it('should return rooms with count on page 1', async () => {
      getActiveRoomsStub.callsFake((start, count, publicOnly, cb) => cb(null, mockRooms));

      await getActiveRooms(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
      const body = res.send.firstCall.args[0];
      expect(body.count).to.equal(25);
      expect(body.rooms).to.deep.equal(mockRooms);
    });

    it('should calculate correct start offset for page 1', async () => {
      getActiveRoomsStub.callsFake((start, count, publicOnly, cb) => {
        expect(start).to.equal(0);
        expect(count).to.equal(10);
        expect(publicOnly).to.equal(false);
        cb(null, []);
      });

      await getActiveRooms(req, res);
    });

    it('should calculate correct start offset for page 3', async () => {
      req.query.page = 3;
      getActiveRoomsStub.callsFake((start, count, publicOnly, cb) => {
        expect(start).to.equal(20);
        expect(count).to.equal(10);
        cb(null, []);
      });

      await getActiveRooms(req, res);
    });

    it('should get room count before fetching rooms', async () => {
      getActiveRoomsStub.callsFake((start, count, publicOnly, cb) => cb(null, []));

      await getActiveRooms(req, res);

      expect(getActiveRoomCountStub.calledOnce).to.equal(true);
    });
  });

  describe('error handling', () => {
    it('should return 500 if getActiveRooms fails', async () => {
      const error = new Error('rooms error');
      getActiveRoomsStub.callsFake((start, count, publicOnly, cb) => cb(error));

      await getActiveRooms(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });
  });
});
