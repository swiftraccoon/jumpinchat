/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
let removeUser;

const roomSave = sinon.stub().resolves({ users: [{ handle: 'foo' }] });

let roomMockData;


describe('Room Remove User Controller', () => {
  let getRoomByName;
  let roomRemove;

  let stubs;

  beforeEach(async () => {
    roomRemove = sinon.stub().yields();
    roomMockData = {
      name: 'foo',
      janus_id: 1234,
      attrs: { owner: 'foo' },
      users: [
        {
          handle: 'foo',
          socket_id: 'socketId',
        },
        {
          handle: 'bar',
          socket_id: 'socketId2',
        },
      ],
      save: roomSave,
    };

    getRoomByName = sinon.stub().yields(null, roomMockData);
    stubs = {
      '../../room.utils.js': { default: { getRoomByName }, getRoomByName },
      '../../controllers/room.remove.js': roomRemove,
    };

    removeUser = await esmock.p('../../controllers/room.removeUser.js', stubs);
  });

  afterEach(() => {
    esmock.purge(removeUser);
  });

  it('should return the removed user', async () => {
    await new Promise((resolve, reject) => {
      removeUser('socketId', { name: 'foo' }, (err, removedUser) => {
        try {
          expect(removedUser).to.eql({ handle: 'foo', socket_id: 'socketId' });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should not remove the room if user count > 0', async () => {
    const roomWithOwner = Object.assign({}, roomMockData, {
      users: [
        {
          handle: 'foo',
          socket_id: 'socketId',
        },
        {
          handle: 'bar',
          socket_id: 'socketId2',
        },
      ],
      attrs: {},
      save: sinon.stub().resolves({ users: ['foo'] }),
    });

    const roomUtilsMock = { getRoomByName: sinon.stub().yields(null, roomWithOwner) };
    stubs = Object.assign({}, stubs, {
      '../../room.utils.js': { default: roomUtilsMock, ...roomUtilsMock },
    });

    removeUser = await esmock.p('../../controllers/room.removeUser.js', stubs);
    await new Promise((resolve, reject) => {
      removeUser('socketId', { name: 'foo' }, () => {
        try {
          expect(roomRemove.called).to.equal(false);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should remove the room if users.length === 0 and has no owner', async () => {
    const roomWithOwner = Object.assign({}, roomMockData, {
      users: [
        {
          handle: 'foo',
          socket_id: 'socketId',
        },
      ],
      attrs: {},
      save: sinon.stub().resolves({ users: [] }),
    });

    const roomUtilsMock = { getRoomByName: sinon.stub().yields(null, roomWithOwner) };
    stubs = Object.assign({}, stubs, {
      '../../room.utils.js': { default: roomUtilsMock, ...roomUtilsMock },
    });

    removeUser = await esmock.p('../../controllers/room.removeUser.js', stubs);

    await new Promise((resolve, reject) => {
      removeUser('socketId', { name: 'foo' }, () => {
        try {
          expect(roomRemove.called).to.equal(true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });
});
