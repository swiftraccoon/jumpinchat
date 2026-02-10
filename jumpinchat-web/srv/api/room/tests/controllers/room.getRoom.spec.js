/* global describe,it,beforeEach */
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import config from '../../../../config/env/index.js';
import esmock from 'esmock';
describe('Get Room', () => {
  let req;
  let res;
  let sendSpy;
  let controller;

  const roomMock = {
    name: 'foo',
    attrs: {},
    save: sinon.stub().resolves(),
    users: [],
  };
  roomMock.save.resolves(roomMock);

  const ioMock = {
    in: sinon.stub().returns({
      fetchSockets: sinon.stub().resolves([{ id: 1 }, { id: 2 }, { id: 3 }]),
    }),
  };

  const roomControllerMock = {
    sanitizeUserList: sinon.stub().yields(),
    getSocketIo: sinon.stub().returns(ioMock),
  };

  const roomCreateSpy = sinon.stub().yields(null, {
    name: 'bar',
    attrs: {
      janusServerId: 'foo',
    },
  });

  const roomUtilsMock = {
    getRoomByName: sinon.stub()
      .yields(null, Object.assign({}, roomMock, { toObject: sinon.stub().returns(roomMock) })),
    checkModAssignedBy: sinon.stub().returns(roomMock),
    filterRoom: sinon.stub().returns(roomMock),
    createJanusRoom: sinon.stub().yields(),
  };

  beforeEach(async () => {
    sendSpy = new Promise(resolve => resolve());
    req = {
      headers: { authorization: '' },
      cookies: {
        'jic.activity': jwt.sign({
          foo: 'bar',
        }, config.auth.jwt_secret),
      },
      signedCookies: {
        'jic.ident': 'foo',
      },
      params: {
        room: 'foo',
      },
      connection: { remoteAddress: '1.2.3.4' },
      sessionID: 'foo',
    };

    res = {
      status: sinon.spy(() => ({
        send: () => sendSpy,
      })),
      cookie: sinon.spy(),
    };

    controller = await esmock('../../controllers/room.getRoom.js', {
      '../../room.utils.js': roomUtilsMock,
      '../../room.controller.js': roomControllerMock,
      '../../controllers/room.create.js': roomCreateSpy,
    });
  });

  it('should get a room', (done) => {
    controller(req, res);

    // Allow promise microtasks (room.save().then()) to settle
    setImmediate(() => {
      expect(res.status.firstCall.args[0]).to.equal(200);
      done();
    });
  });

  it('should create a room if no room exists', async () => {
    const noRoomUtilsMock = {
      getRoomByName: sinon.stub().yields(null),
      checkModAssignedBy: sinon.stub().returns(roomMock),
      filterRoom: sinon.stub().returns(roomMock),
      createJanusRoom: sinon.stub().yields(),
    };

    const localRoomCreateSpy = sinon.stub().yields(null, {
      name: 'bar',
      attrs: {
        janusServerId: 'foo',
      },
    });

    controller = await esmock('../../controllers/room.getRoom.js', {
      '../../room.utils.js': { default: noRoomUtilsMock, ...noRoomUtilsMock },
      '../../room.controller.js': roomControllerMock,
      '../../controllers/room.create.js': localRoomCreateSpy,
    });

    res.status.resetHistory();
    controller(req, res);

    await sendSpy;
    expect(res.status.firstCall.args[0]).to.equal(201);
    expect(localRoomCreateSpy.firstCall.args[0]).to.eql({
      ip: '1.2.3.4',
      name: 'foo',
      sessionId: 'foo',
    });
  });
});
