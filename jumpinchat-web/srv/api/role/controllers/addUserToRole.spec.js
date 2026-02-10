
import * as chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import { NotFoundError } from '../../../utils/error.util.js';
import esmock from 'esmock';
chai.use(chaiAsPromised);

const { expect } = chai;

describe('addUserToRoleController', () => {
  let controller;
  let room;
  let roleUtilsStubs;
  let ioStub;
  let emitStub;
  beforeEach(async () => {
    room = {
      _id: 'roomId',
      attrs: {
        owner: 'bar',
      },
      users: [
        {
          _id: 'foo',
          session_id: 'session',
          ip: '1.2.3.4',
          roles: [],
        },
      ],
      save: sinon.stub().resolves(),
      toObject: sinon.stub().returns(room),
    };

    emitStub = sinon.spy();

    ioStub = {
      to: () => ({
        emit: emitStub,
      }),
    };


    roleUtilsStubs = {
      getSocketIo: () => ioStub,
      getRoleById: () => Promise.resolve({
        _id: 'roleId',
      }),
      getUserHasRolePermissions: sinon.stub().resolves(true),
    };

    controller = (await esmock('./addUserToRole.controller.js', {
      '../enrolled.model.js': { default: {
        create: enrollment => Promise.resolve(enrollment),
      } },
      '../role.utils.js': roleUtilsStubs,
      '../../room/room.utils.js': {
        getRoomByName: sinon.stub().returns(Promise.resolve(room)),
        filterClientUser: u => u,
        filterRoomUser: u => u,
      },
      '../../../utils/utils.js': { default: {
        messageFactory: m => m,
      } },
    })).default;
  });

  it('should fail if the room is not found', async () => {
    controller = (await esmock('./addUserToRole.controller.js', {
      '../enrolled.model.js': { default: {
        create: enrollment => Promise.resolve(enrollment),
      } },
      '../role.utils.js': roleUtilsStubs,
      '../../room/room.utils.js': {
        getRoomByName: sinon.stub().returns(Promise.resolve(null)),
        filterClientUser: u => u,
        filterRoomUser: u => u,
      },
      '../../../utils/utils.js': { default: {
        messageFactory: m => m,
      } },
    })).default;

    await expect(controller({
      roomName: 'foo',
      userListId: 'bar',
      roleId: 'role',
      enrollingUser: 'mod',
    })).to.be.rejectedWith(NotFoundError);
  });

  it('should fail if user not found in room userlist', async () => {
    await expect(controller({
      roomName: 'foo',
      userListId: 'bar',
      roleId: 'role',
      enrollingUser: 'mod',
    })).to.be.rejectedWith(NotFoundError);
  });

  it('should fail if role not found', async () => {
    controller = (await esmock('./addUserToRole.controller.js', {
      '../enrolled.model.js': { default: {
        create: enrollment => Promise.resolve(enrollment),
      } },
      '../role.utils.js': {
        ...roleUtilsStubs,
        getRoleById: () => Promise.resolve(null),
      },
      '../../room/room.utils.js': {
        getRoomByName: sinon.stub().returns(Promise.resolve(room)),
        filterClientUser: u => u,
        filterRoomUser: u => u,
      },
      '../../../utils/utils.js': { default: {
        messageFactory: m => m,
      } },
    })).default;

    await expect(controller({
      roomName: 'foo',
      userListId: 'foo',
      roleId: 'role',
      enrollingUser: 'mod',
    })).to.be.rejectedWith(NotFoundError);
  });

  it('should set user in enrollment', async () => {
    room.users = [{
      _id: 'foo',
      userId: 'user',
      roles: [],
    }];

    const enrollment = await controller({
      roomName: 'foo',
      userListId: 'foo',
      roleId: 'role',
      enrollingUser: 'mod',
      userId: 'user',
      roles: [],
    });

    expect(enrollment.user).to.equal('user');
  });

  it('should set ident if no user ID present', async () => {
    room.users = [{
      _id: 'foo',
      userId: null,
      session_id: 'session',
      ip: '1.2.3.4',
      roles: [],
    }];

    const enrollment = await controller({
      roomName: 'foo',
      userListId: 'foo',
      roleId: 'role',
      enrollingUser: 'mod',
    });

    expect(enrollment.ident).to.eql({
      sessionId: 'session',
      ip: '1.2.3.4',
    });

    expect(enrollment.user).to.equal(null);
  });

  it('should set room ID', async () => {
    const enrollment = await controller({
      roomName: 'foo',
      userListId: 'foo',
      roleId: 'role',
      enrollingUser: 'mod',
    });

    expect(enrollment.room).to.equal('roomId');
  });
});
