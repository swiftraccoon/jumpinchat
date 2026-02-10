/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import config from '../../../../config/env/index.js';
import esmock from 'esmock';
let leaveRoom;
const socketId = 'socketId';

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

const roomSaveStub = sinon.stub().yields(null, roomMockData);

const userData = {
  handle: 'foo',
};

const addToQueue = sinon.stub().callsFake(args => args[2](null, userData));
function QueueStub() {
  this.length = 1;
  this.on = sinon.spy();
}

QueueStub.prototype.addToQueue = addToQueue;

let roomUtilsStub;

describe('Room Leave Controller', () => {
  beforeEach(async () => {
    roomUtilsStub = {
      addToRemoveUserQueue: sinon.stub().yields(null, 'foo'),
    };

    const redisCallPromise = sinon.stub().resolves({});
    redisCallPromise.withArgs('hgetall', 'socketId').resolves({ socketId, name: 'roomName' });

    leaveRoom = await esmock('../../controllers/room.leaveRoom.js', {
      '../../room.utils.js': roomUtilsStub,
      '../../../../utils/queue.util.js': QueueStub,
      '../../../../utils/redis.util.js': {
        callPromise: redisCallPromise,
      },
    });
  });

  it('should add a user to the queue', (done) => {
    leaveRoom(socketId, (err) => {
      if (err) return done(err);
      try {
        expect(roomUtilsStub.addToRemoveUserQueue.getCall(0).args[0]).to.equal(socketId);
        expect(roomUtilsStub.addToRemoveUserQueue.getCall(0).args[1]).to.eql('roomName');

        done();
      } catch (err) {
        return done(err);
      }
    });
  });
});
