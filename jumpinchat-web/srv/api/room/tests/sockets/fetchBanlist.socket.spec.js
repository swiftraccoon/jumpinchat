import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('Fetch banlist socket', () => {
  let socket;
  const socketEmitSpy = sinon.spy();
  const ioEmitSpy = sinon.spy();

  const socketMock = (emit = socketEmitSpy) => ({
    id: 'foo',
    emit,
  });

  const ioMock = (emit = ioEmitSpy) => ({
    to: sinon.stub().returns({
      emit,
    }),
  });

  const getSocketCacheInfo = sinon.stub().resolves({
    handle: 'foo',
    color: '#000000',
    userListId: '123',
  });

  let checkOperatorPermissions;
  let fetchBanlist;

  const messageFactory = sinon.stub().callsFake(msg => msg);

  const defaultControllerOpts = {
    operatorPermissions: true,
  };

  const createController = async (opts = defaultControllerOpts) => {
    checkOperatorPermissions = sinon.stub().yields(null, opts.operatorPermissions);
    fetchBanlist = sinon.stub().yields(null, ['foo', 'bar']);

    return await esmock('../../sockets/fetchBanlist.socket.js', {
      '../../../role/role.utils.js': {
        getUserHasRolePermissions: sinon.stub().resolves(true),
      },
      '../../room.utils.js': {
        getSocketCacheInfo,
        checkOperatorPermissions,
      },
      '../../room.controller.js': {
        fetchBanlist,
      },
      '../../../../utils/utils.js': {
        messageFactory,
      },
    });
  };

  beforeEach(function beforeEach() {
    this.timeout(5000);
  });

  it('should emit the banlist to the client', async () => {
    socket = await createController();
    await new Promise((resolve, reject) => {
      const emit = (msg, body) => {
        if (msg === 'client::banlist') {
          expect(body).to.eql({ list: ['foo', 'bar'] });
          resolve();
        }

        if (msg === 'client::error') {
          reject(Error(msg));
        }
      };
      const controller = socket(socketMock(emit));
      controller();
    });
  });
});
