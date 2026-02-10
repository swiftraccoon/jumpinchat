
import * as chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import { NotFoundError } from '../../../utils/error.util.js';
import esmock from 'esmock';
chai.use(chaiAsPromised);

const { expect } = chai;

describe('getUserRolesController', () => {
  let controller;
  let room;
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
        },
      ],
    };

    const roomUtilsMock = {
      getRoomByName: sinon.stub().returns(Promise.resolve(room)),
    };

    controller = (await esmock.p('./getUserRoles.controller.js', {
      '../role.utils.js': {
        getUserEnrollments: () => Promise.resolve([]),
      },
      '../../room/room.utils.js': {
        default: roomUtilsMock,
        ...roomUtilsMock,
      },
    })).default;
  });

  afterEach(() => {
    esmock.purge(controller);
  });

  it('should return NotFoundError if room not found', async () => {
    const roomUtilsMock = {
      getRoomByName: sinon.stub().returns(Promise.resolve(null)),
    };

    controller = (await esmock.p('./getUserRoles.controller.js', {
      '../role.utils.js': {
        getUserEnrollments: () => Promise.resolve([]),
      },
      '../../room/room.utils.js': {
        default: roomUtilsMock,
        ...roomUtilsMock,
      },
    })).default;

    await expect(controller({
      userListId: 'foo',
      roomName: 'room',
    })).to.be.rejectedWith(NotFoundError);
  });

  it('should return NotFoundError if user not found', async () => {
    await expect(controller({
      userListId: 'bar',
      roomName: 'room',
    })).to.be.rejectedWith(NotFoundError);
  });
});
