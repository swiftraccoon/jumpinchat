/* global describe,it,beforeEach */


import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('Room Remove Controller', () => {
  const remove = sinon.stub().yields();

  const save = sinon.stub().resolves();

  let roomMockData;

  let removePlaylistByRoomId;
  let getRoomByName;
  let removeJanusRoom;
  let controller;

  let roomUtilsStubs;

  beforeEach(async () => {
    roomMockData = {
      _id: 'abc',
      name: 'foo',
      attrs: {
        owner: 'foo',
        janusServerId: 'server',
        janus_id: 1234,
      },
      save,
    };

    removePlaylistByRoomId = sinon.stub().returns(Promise.resolve());
    getRoomByName = sinon.stub().returns(Promise.resolve(roomMockData));
    removeJanusRoom = sinon.stub().returns(Promise.resolve());

    roomUtilsStubs = {
      getRoomByName,
      removeJanusRoom,
    };

    controller = (await esmock('./room.remove.js', {
      '../room.utils.js': { default: roomUtilsStubs },
      '../room.model.js': { default: {
        deleteOne: remove,
      } },
      '../../youtube/playlist.utils.js': {
        removePlaylistByRoomId,
      },
      '../../role/role.utils.js': {
        removeRoomRoles: () => Promise.resolve(),
        removeRoomEnrollments: () => Promise.resolve(),
      },
    })).default;
  });

  it('should remove the Janus room', (done) => {
    controller(roomMockData, () => {
      expect(removeJanusRoom.getCall(0).args[0]).to.equal('server');
      expect(removeJanusRoom.getCall(0).args[1]).to.equal(1234);
      done();
    });
  });

  it('should not remove a room with an owner ID in attrs', (done) => {
    controller(roomMockData, () => {
      expect(remove.called).to.equal(false);
      done();
    });
  });

  it('should remove a room without an owner ID', async () => {
    const newRoomUtilsStubs = {
      ...roomUtilsStubs,
      getRoomByName: sinon.stub().returns(Promise.resolve({
        ...roomMockData,
        attrs: {
          ...roomMockData.attrs,
          owner: undefined,
        },
      })),
    };

    controller = (await esmock('./room.remove.js', {
      '../room.utils.js': { default: newRoomUtilsStubs },
      '../room.model.js': { default: {
        deleteOne: remove,
      } },
      '../../youtube/playlist.utils.js': {
        removePlaylistByRoomId,
      },
      '../../role/role.utils.js': {
        removeRoomRoles: () => Promise.resolve(),
        removeRoomEnrollments: () => Promise.resolve(),
      },
    })).default;

    await new Promise((resolve) => {
      controller(roomMockData, () => {
        expect(remove.called).to.equal(true);
        resolve();
      });
    });
  });

  it('should remove playlist', (done) => {
    controller(roomMockData, () => {
      expect(removePlaylistByRoomId.called).to.equal(true);
      expect(removePlaylistByRoomId.getCall(0).args[0]).to.equal('abc');
      done();
    });
  });
});
