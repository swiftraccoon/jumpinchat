import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('getUserList.controller', () => {
  let getUserList;
  let req;
  let res;
  let getUserCountStub;
  let getAllUsersStub;

  const mockUsers = [
    {
      _id: 'user1',
      username: 'alice',
      auth: { email: 'alice@test.com', passhash: 'secrethash1' },
      attrs: { join_date: new Date() },
    },
    {
      _id: 'user2',
      username: 'bob',
      auth: { email: 'bob@test.com', passhash: 'secrethash2' },
      attrs: { join_date: new Date() },
    },
  ];

  function createRes() {
    return {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
  }

  beforeEach(async () => {
    getUserCountStub = sinon.stub();
    getAllUsersStub = sinon.stub();

    const mod = await esmock('./getUserList.controller.js', {
      '../../../utils/logger.util.js': { default: () => ({ debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), fatal: sinon.stub() }) },
      '../../../config/env/index.js': { default: { admin: { userList: { itemsPerPage: 10 } } } },
      '../../user/user.utils.js': { default: { getUserCount: getUserCountStub, getAllUsers: getAllUsersStub } },
    });

    getUserList = mod.default;
    res = createRes();
    req = { query: { page: 1 } };
  });

  describe('happy path', () => {
    it('should return user list with count', () => {
      getUserCountStub.callsFake((cb) => cb(null, 50));
      getAllUsersStub.callsFake((start, count, cb) => cb(null, mockUsers));

      getUserList(req, res);

      expect(res.status.calledWith(200)).to.equal(true);
      const body = res.send.firstCall.args[0];
      expect(body.count).to.equal(50);
      expect(body.users).to.have.lengthOf(2);
    });

    it('should sanitize user passhash to empty string', () => {
      getUserCountStub.callsFake((cb) => cb(null, 50));
      getAllUsersStub.callsFake((start, count, cb) => cb(null, mockUsers));

      getUserList(req, res);

      const body = res.send.firstCall.args[0];
      body.users.forEach((user) => {
        expect(user.auth.passhash).to.equal('');
      });
    });

    it('should calculate correct start offset for page 1', () => {
      getUserCountStub.callsFake((cb) => cb(null, 50));
      getAllUsersStub.callsFake((start, count, cb) => {
        expect(start).to.equal(0);
        expect(count).to.equal(10);
        cb(null, []);
      });

      getUserList(req, res);
    });

    it('should calculate correct start offset for page 3', () => {
      req.query.page = 3;
      getUserCountStub.callsFake((cb) => cb(null, 50));
      getAllUsersStub.callsFake((start, count, cb) => {
        expect(start).to.equal(20);
        expect(count).to.equal(10);
        cb(null, []);
      });

      getUserList(req, res);
    });
  });

  describe('error handling', () => {
    it('should return 500 if getUserCount fails', () => {
      const error = new Error('count error');
      getUserCountStub.callsFake((cb) => cb(error));

      getUserList(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });

    it('should return 500 if getAllUsers fails', () => {
      const error = new Error('users error');
      getUserCountStub.callsFake((cb) => cb(null, 50));
      getAllUsersStub.callsFake((start, count, cb) => cb(error));

      getUserList(req, res);

      expect(res.status.calledWith(500)).to.equal(true);
    });
  });
});
