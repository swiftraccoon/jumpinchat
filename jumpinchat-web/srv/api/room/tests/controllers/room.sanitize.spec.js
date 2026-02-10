/* global describe,it,beforeEach */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
let roomSanitize;
let leaveRoom;

const roomSave = sinon.stub().yields();

let roomMockData;

const ioMock = {
  in: sinon.stub().returns({
    fetchSockets: sinon.stub().resolves([{ id: 1 }, { id: 2 }, { id: 3 }]),
  }),
};


describe('Room Sanitize Controller', () => {
  let getRoomByName;
  const disconnectUserSocket = sinon.spy();
  const getSocketIo = sinon.stub().returns(ioMock);

  let stubs;

  beforeEach(async () => {
    roomMockData = {
      name: 'foo',
      janus_id: 1234,
      attrs: { owner: 'foo' },
      users: [
        {
          socket_id: 'socketId',
        },
        {
          socket_id: 'socketId2',
        },
      ],
      save: roomSave,
    };

    getRoomByName = sinon.stub().yields(null, roomMockData);
    leaveRoom = sinon.stub().yields();
    stubs = {
      '../../room.controller.js': {
        getSocketIo,
        leaveRoom,
      },
      '../../room.utils.js': {
        getRoomByName,
      },
      '../../sockets/disconnectUser.socket.js': disconnectUserSocket,
      '../../../../lib/redis.util.js': () => ({ del: sinon.stub().resolves() }),
    };

    roomSanitize = await esmock('../../controllers/room.sanitize.js', stubs);
  });

  it('should call disconnect for each socket not in the global list', (done) => {
    roomSanitize('room', () => {
      done();
    });
  });
});
