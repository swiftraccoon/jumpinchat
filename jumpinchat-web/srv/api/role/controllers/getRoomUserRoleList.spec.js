
import * as chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import esmock from 'esmock';
chai.use(chaiAsPromised);

const { expect } = chai;

describe('getRoomUserRoleListController', () => {

  it('should return formatted enrollment list', async () => {
    const controller = (await esmock('./getRoomUserRoleList.js', {
      '../role.utils.js': {
        getDefaultRoles: () => Promise.resolve([
          {
            _id: 'default',
            name: 'default role',
            tag: 'default_role',
            isDefault: true,
          },
        ]),
        getAllRoomEnrollments: () => Promise.resolve([
          {
            _id: 'enrollmentId',
            role: {
              _id: 'roleId',
              name: 'roleName',
              tag: 'role_name',
            },
            user: {
              username: 'username',
              _id: 'userId',
            },
          },
          {
            _id: 'enrollmentId2',
            role: {
              _id: 'roleId',
              name: 'roleName',
              tag: 'role_name',
            },
            user: {
              username: 'username',
              _id: 'userId',
            },
          },
          {
            _id: 'enrollmentId3',
            role: {
              _id: 'roleId',
              name: 'roleName',
              tag: 'role_name',
            },
            user: {
              username: 'username2',
              _id: 'userId2',
            },
          },
        ]),
      },
      '../../room/room.utils.js': {
        getRoomByName: sinon.stub().returns(Promise.resolve({
          _id: 'foo',
          attrs: {
            owner: 'bar',
          },
        })),
      },
    })).default;

    try {
      const result = await controller({ roomName: 'foo' });
      expect(result).to.eql([
        {
          username: 'username',
          userId: 'userId',
          roles: [
            {
              roleId: 'default',
              name: 'default role',
              tag: 'default_role',
              enrollmentId: null,
              isDefault: true,
            },
            {
              enrollmentId: 'enrollmentId',
              name: 'roleName',
              roleId: 'roleId',
              tag: 'role_name',
            },
            {
              enrollmentId: 'enrollmentId2',
              name: 'roleName',
              roleId: 'roleId',
              tag: 'role_name',
            },
          ],
        },
        {
          username: 'username2',
          userId: 'userId2',
          roles: [
            {
              roleId: 'default',
              name: 'default role',
              tag: 'default_role',
              enrollmentId: null,
              isDefault: true,
            },
            {
              enrollmentId: 'enrollmentId3',
              name: 'roleName',
              roleId: 'roleId',
              tag: 'role_name',
            },
          ],
        },
      ]);
    } catch (err) {
      throw err;
    }
  });
});
