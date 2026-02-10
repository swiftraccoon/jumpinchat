
import * as chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import { PermissionError } from '../../../utils/error.util.js';
import esmock from 'esmock';
chai.use(chaiAsPromised);

const { expect } = chai;

describe('updateRoomRoleController', () => {

  let roleModelUpdate;
  let roleUtilStubs;
  let roleCreateStub;
  let emitStub;
  let ioStub;

  const roomUtilsMock = {
    getRoomByName: sinon.stub().returns(Promise.resolve({
      _id: 'foo',
      attrs: {
        owner: 'user',
      },
    })),
  };

  beforeEach(() => {
    roleModelUpdate = sinon.stub().resolves({});
    roleCreateStub = sinon.stub().resolves({});
    emitStub = sinon.spy();

    ioStub = {
      to: () => ({
        emit: emitStub,
      }),
    };

    roleUtilStubs = {
      getSocketIo: () => ioStub,
      getAllRoomRoles: () => Promise.resolve([]),
      getUserEnrollments: () => Promise.resolve([]),
      getUserHasRolePermissions: () => Promise.resolve(true),
      validateTag: () => true,
    };
  });

  it('should succeed if user has manage role permissions', async () => {
    const localRoleUtilStubs = {
      ...roleUtilStubs,
      getUserEnrollments: () => Promise.resolve([
        {
          role: {
            permissions: {
              manageRoles: true,
            },
          },
        },
      ]),
    };
    const controller = (await esmock('./updateRoomRole.controller.js', {
      '../role.model.js': { default: { updateOne: roleModelUpdate } },
      '../role.utils.js': { default: localRoleUtilStubs },
      './createRole.controller.js': { default: roleCreateStub },
      '../../room/room.utils.js': roomUtilsMock,
    })).default;

    try {
      await controller({
        roomName: 'foo',
        userId: 'notowner',
        roles: [
          {
            _id: 'newRole',
            name: 'newRole',
            tag: 'tag',
            permissions: {},
          },
        ],
      });
    } catch (err) {
      throw err;
    }
  });

  it('should create new roles if they do not exist', async () => {
    const localRoleUtilStubs = {
      ...roleUtilStubs,
      getAllRoomRoles: () => Promise.resolve([
        {
          _id: 'oldRole',
          permissions: {},
        },
      ]),
    };
    const controller = (await esmock('./updateRoomRole.controller.js', {
      '../role.model.js': { default: { updateOne: roleModelUpdate } },
      '../role.utils.js': { default: localRoleUtilStubs },
      './createRole.controller.js': { default: roleCreateStub },
      '../../room/room.utils.js': roomUtilsMock,
    })).default;

    try {
      await controller({
        roomName: 'foo',
        userId: 'user',
        roles: [
          {
            _id: 'newRole',
            name: 'newRole',
            tag: 'tag',
            permissions: {},
          },
        ],
      });
    } catch (err) {
      throw err;
    }

    expect(roleCreateStub.callCount).to.equal(1);
  });

  it('should update roles if they exist', async () => {
    const localRoleUtilStubs = {
      ...roleUtilStubs,
      getAllRoomRoles: () => Promise.resolve([
        {
          _id: 'oldRole',
          name: 'oldrole',
          tag: 'tag',
          permissions: {},
        },
      ]),
    };
    const controller = (await esmock('./updateRoomRole.controller.js', {
      '../role.model.js': { default: { updateOne: roleModelUpdate } },
      '../role.utils.js': { default: localRoleUtilStubs },
      './createRole.controller.js': { default: roleCreateStub },
      '../../room/room.utils.js': roomUtilsMock,
    })).default;

    try {
      await controller({
        roomName: 'foo',
        userId: 'user',
        roles: [
          {
            _id: 'oldRole',
            name: 'oldrole',
            tag: 'tag',
            permissions: {},
          },
        ],
      });
    } catch (err) {
      throw err;
    }

    expect(roleModelUpdate.callCount).to.equal(1);
  });

  it('should update and create roles', async () => {
    const localRoleUtilStubs = {
      ...roleUtilStubs,
      getAllRoomRoles: () => Promise.resolve([
        {
          _id: 'olderRole',
          permissions: {},
        },
        {
          _id: 'oldRole',
          permissions: {},
        },
      ]),
    };

    const controller = (await esmock('./updateRoomRole.controller.js', {
      '../role.model.js': { default: { updateOne: roleModelUpdate } },
      '../role.utils.js': { default: localRoleUtilStubs },
      './createRole.controller.js': { default: roleCreateStub },
      '../../room/room.utils.js': roomUtilsMock,
    })).default;

    try {
      await controller({
        roomName: 'foo',
        userId: 'user',
        roles: [
          {
            _id: 'oldRole',
            name: 'oldRole',
            tag: 'foo',
            permissions: {},
          },
          {
            _id: 'newRole',
            name: 'newRole',
            tag: 'bar',
            permissions: {},
          },
        ],
      });
    } catch (err) {
      throw err;
    }

    expect(roleModelUpdate.callCount).to.equal(1);
    expect(roleCreateStub.callCount).to.equal(1);
  });
});
