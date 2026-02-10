/* global it,describe */

import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('sendPush', () => {
  let controller;
  let webPush;
  let roomUtils;
  beforeEach(async () => {
    webPush = {
      sendNotification: sinon.stub().returns(Promise.resolve()),
    };

    roomUtils = {
      getSocketCacheInfo: sinon.stub().yields(null, {
        pushEndpoint: 'endpoint',
        pushTTL: null,
        pushKey: 'key',
        pushAuth: 'auth',
      }),
    };

    controller = await esmock.p('../../utils/room.utils.sendPush.js', {
      'web-push': webPush,
      '../../room.utils.js': { default: roomUtils, ...roomUtils },
    });
  });

  afterEach(() => {
    esmock.purge(controller);
  });

  it('should send a push notification', async () => {
    const sender = {
      handle: 'handle',
      name: 'room',
    };
    await controller('foo', sender, 'socket');
    expect(webPush.sendNotification.called).to.equal(true);
  });
});
