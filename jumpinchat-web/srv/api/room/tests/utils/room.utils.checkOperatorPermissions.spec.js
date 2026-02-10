/* global it,describe,beforeEach,afterEach */


import { expect } from 'chai';
import sinon from 'sinon';
import _ from 'lodash';
import _room_mock_json from '../room.mock.json' with { type: 'json' };
import esmock from 'esmock';

let roomMock;
let controller;
let roomUtilsStub;
let userUtilsStub;

describe('Check operator permissions', () => {
  beforeEach(async () => {
    roomMock = Object.assign({}, _room_mock_json);

    roomUtilsStub = {
      getRoomByName: sinon.stub().yields(null, roomMock),
      getSocketCacheInfo: sinon.stub().yields(null, {
        name: 'name',
      }),
    };

    userUtilsStub = {
      getUserById: sinon.stub().yields(null, { attrs: { userLevel: 0 } }),
    };

    controller = await esmock.p('../../utils/room.utils.checkOperatorPermissions.js', {
      '../../room.utils.js': { default: roomUtilsStub, ...roomUtilsStub },
      '../../../user/user.utils.js': { default: userUtilsStub, ...userUtilsStub },

      '../../../role/controllers/getUserRoles.controller.js': sinon.stub().resolves([
        {
          permissions: {
            foo: true,
          },
        },
      ]),
    });
  });

  afterEach(() => {
    roomUtilsStub.getRoomByName.reset();
    roomUtilsStub.getSocketCacheInfo.reset();
    esmock.purge(controller);
  });


  it('should return false if user is not in mod list', (done) => {
    const socketId = roomMock.users[4].socket_id;
    const action = 'ban';

    controller(socketId, action, (err, permission) => {
      expect(permission).to.equal(false);
      return done();
    });
  });

  it('should return false if user has no operator_id in their object', (done) => {
    const socketId = roomMock.users[4].socket_id;
    const action = 'ban';

    controller(socketId, action, (err, permission) => {
      expect(permission).to.equal(false);
      done();
    });
  });

  it('should return true if user has permissions', (done) => {
    const socketId = roomMock.users[0].socket_id;
    const action = 'foo';

    controller(socketId, action, (err, permission) => {
      if (err) return done(err);
      try {
        expect(permission).to.equal(true);
        return done();
      } catch (e) {
        return done(e);
      }
    });
  });

  it('should return false if a guest user dos not have a matching session ID', (done) => {
    const socketId = 'guest';
    const action = 'ban';

    controller(socketId, action, (err, permission) => {
      expect(permission).to.equal(false);
      done();
    });
  });

  it('should return false if action is not allowed in permissions', (done) => {
    const socketId = roomMock.users[0].socket_id;
    const action = 'assign_operator';

    controller(socketId, action, (err, permission) => {
      expect(permission).to.equal(false);
      done();
    });
  });

  it('should allow an admin to perform op actions', async () => {
    esmock.purge(controller);
    const socketId = roomMock.users[2].socket_id;
    const action = 'ban';
    userUtilsStub = {
      getUserById: sinon.stub().yields(null, { attrs: { userLevel: 30 } }),
    };

    controller = await esmock.p('../../utils/room.utils.checkOperatorPermissions.js', {
      '../../room.utils.js': { default: roomUtilsStub, ...roomUtilsStub },
      '../../../user/user.utils.js': { default: userUtilsStub, ...userUtilsStub },
    });

    await new Promise((resolve, reject) => {
      controller(socketId, action, (err, permission) => {
        try {
          expect(permission).to.equal(true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });
});
