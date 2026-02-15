
import * as chai from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

const { expect } = chai;

describe('handleJanusEvents.controller', () => {
  let controller;
  let req;
  let res;
  let mockRedisUtils;
  let mockGetUserByListId;

  function createRes() {
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  beforeEach(async () => {
    mockRedisUtils = {
      callPromise: sinon.stub().resolves(),
    };
    mockGetUserByListId = sinon.stub();

    controller = (await esmock('./handleJanusEvents.controller.js', {
      '../../../utils/redis.util.js': { default: mockRedisUtils },
      '../../room/room.utils.js': {
        getUserByListId: mockGetUserByListId,
      },
    })).default;
  });

  describe('response handling', () => {
    it('should always respond with 200', () => {
      createRes();
      req = { body: [] };
      controller(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
      expect(res.send.calledOnce).to.equal(true);
    });

    it('should respond 200 even when body is not an array', () => {
      createRes();
      req = { body: 'not-an-array' };
      controller(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
    });

    it('should respond 200 when body is null', () => {
      createRes();
      req = { body: null };
      controller(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
    });
  });

  describe('event processing', () => {
    it('should process a joined event and set Janus session in redis', async () => {
      const userListId = 'user-list-123';
      const socketId = 'socket-abc';
      const sessionId = 98765;

      mockGetUserByListId.resolves({ socket_id: socketId });

      createRes();
      req = {
        body: [
          {
            session_id: sessionId,
            event: {
              data: {
                event: 'joined',
                display: userListId,
              },
            },
          },
        ],
      };

      controller(req, res);

      // Wait for async handleSetJanusSession to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockGetUserByListId.calledWith(userListId)).to.equal(true);
      expect(mockRedisUtils.callPromise.calledWith('hmset', socketId, { janusSessionId: sessionId })).to.equal(true);
      expect(mockRedisUtils.callPromise.calledWith('expire', socketId, 60 * 60 * 24)).to.equal(true);
    });

    it('should skip redis calls when user is not found', async () => {
      mockGetUserByListId.resolves(null);

      createRes();
      req = {
        body: [
          {
            session_id: 12345,
            event: {
              data: {
                event: 'joined',
                display: 'unknown-user',
              },
            },
          },
        ],
      };

      controller(req, res);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockGetUserByListId.calledOnce).to.equal(true);
      expect(mockRedisUtils.callPromise.called).to.equal(false);
    });

    it('should skip redis calls when getUserByListId rejects', async () => {
      mockGetUserByListId.rejects(new Error('db error'));

      createRes();
      req = {
        body: [
          {
            session_id: 12345,
            event: {
              data: {
                event: 'joined',
                display: 'some-user',
              },
            },
          },
        ],
      };

      controller(req, res);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockRedisUtils.callPromise.called).to.equal(false);
    });

    it('should ignore events without event.data', () => {
      createRes();
      req = {
        body: [
          {
            session_id: 11111,
            event: {},
          },
        ],
      };

      controller(req, res);

      expect(mockGetUserByListId.called).to.equal(false);
    });

    it('should ignore events with unknown event type', () => {
      createRes();
      req = {
        body: [
          {
            session_id: 22222,
            event: {
              data: {
                event: 'destroyed',
                display: 'some-user',
              },
            },
          },
        ],
      };

      controller(req, res);

      expect(mockGetUserByListId.called).to.equal(false);
    });

    it('should process multiple events in a single request', async () => {
      mockGetUserByListId.resolves({ socket_id: 'sock1' });

      createRes();
      req = {
        body: [
          {
            session_id: 111,
            event: {
              data: {
                event: 'joined',
                display: 'user1',
              },
            },
          },
          {
            session_id: 222,
            event: {
              data: {
                event: 'joined',
                display: 'user2',
              },
            },
          },
        ],
      };

      controller(req, res);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockGetUserByListId.calledTwice).to.equal(true);
      expect(mockGetUserByListId.calledWith('user1')).to.equal(true);
      expect(mockGetUserByListId.calledWith('user2')).to.equal(true);
    });

    it('should handle empty event array', () => {
      createRes();
      req = { body: [] };
      controller(req, res);

      expect(mockGetUserByListId.called).to.equal(false);
      expect(res.status.calledWith(200)).to.equal(true);
    });
  });
});
