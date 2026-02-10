/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
let privateMessage;

const roomMockData = {
  name: 'foo',
  users: [
    {
      _id: 'userId',
      handle: 'handle',
      socket_id: 'socketId',
    },
  ],
};

const mockUserData = {
  settings: {
    allowPrivateMessages: true,
  },
};

const getRoomByName = sinon.stub().yields(null, roomMockData);
const setSocketByListId = sinon.stub().yields();
const getSocketIdFromListId = sinon.stub().yields(null, 'targetSocketId');
const getSocketIdFromRoom = sinon.stub().yields(null, {
  socketId: 'targetSocketId',
  userId: 'targetUserId',
});
const setSocketIdByListId = sinon.stub().yields();

const getUserById = sinon.stub().yields(null, mockUserData);

const roomUtilsStubs = {
  getRoomByName,
  setSocketByListId,
  getSocketIdFromListId,
  getSocketIdFromRoom,
  setSocketIdByListId,
};


describe('Private message controller', () => {
  beforeEach(async () => {
    privateMessage = await esmock('../../controllers/room.privateMessage.js', {
      '../../room.utils.js': roomUtilsStubs,
      '../../../user/user.utils.js': {
        getUserById,
      },
    });
  });

  it('should attempt to get the socket by user list ID', (done) => {
    privateMessage('room', 'socketId', 'userId', () => {
      expect(getSocketIdFromListId.called).to.equal(true);
      expect(getSocketIdFromListId.firstCall.args[0]).to.equal('userId');
      done();
    });
  });

  it('should get socket ID from room if not set in cache', async () => {
    privateMessage = await esmock('../../controllers/room.privateMessage.js', {
      '../../room.utils.js': Object.assign({}, roomUtilsStubs, {
        getSocketIdFromListId: sinon.stub().yields(),
      }),
      '../../../user/user.utils.js': {
        getUserById,
      },
    });

    await new Promise((resolve, reject) => {
      privateMessage('room', 'socketId', 'userId', () => {
        try {
          expect(getSocketIdFromRoom.called).to.equal(true);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should fail if user does not allow messages', async () => {
    const getUserByIdNoMsg = sinon.stub().yields(null, {
      settings: {
        allowPrivateMessages: false,
      },
    });

    privateMessage = await esmock('../../controllers/room.privateMessage.js', {
      '../../room.utils.js': Object.assign({}, roomUtilsStubs, {
        getSocketIdFromListId: sinon.stub().yields(),
      }),
      '../../../user/user.utils.js': {
        getUserById: getUserByIdNoMsg,
      },
    });

    await new Promise((resolve, reject) => {
      privateMessage('room', 'socketId', 'userId', (err) => {
        try {
          expect(err).to.eql({
            message: 'user does not allow private messages',
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('should return target socket ID', (done) => {
    privateMessage('room', 'socketId', 'userId', (err, socketId) => {
      expect(socketId).to.equal('targetSocketId');
      done();
    });
  });

  xit('should return socket ID if socket ID not already in cache', (done) => {
    done();
  });

  xit('should return socket ID if socket ID not already in cache and sending to registered user', (done) => {
    done();
  });
});
