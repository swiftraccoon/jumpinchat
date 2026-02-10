
import webPush from 'web-push';
import * as uuid from 'uuid';
import config from '../../../config/env/index.js';
import logFactory from '../../../utils/logger.util.js';
import _ from 'lodash';
const { escapeRegExp } = _;
const log = logFactory({ name: 'sendPush' });
function push(endpoint, TTL, p256dh, auth, payload) {
  if (!endpoint) {
    log.error('push endpoint missing');
    return;
  }

  const {
    publicKey,
    privateKey,
    gcmAPIKey,
  } = config.push;

  const subscription = {
    endpoint,
    TTL,
    keys: {
      p256dh,
      auth,
    },
  };

  const options = {
    vapidDetails: {
      subject: 'mailto:contact@example.com',
      publicKey,
      privateKey,
    },
    gcmAPIKey,
  };

  webPush.sendNotification(subscription, payload, options)
    .then(() => log.info('push notification sent'))
    .catch(err => log.error({ err }, 'failed to send push notification'));
}

export default async function sendPush(message, senderData, recipientSocketId, options = {}) {
  // Lazy require to break circular dependency: room.utils → sendPush → room.utils
  const { default: RoomUtils } = await import('../room.utils.js');
  RoomUtils.getSocketCacheInfo(recipientSocketId, (err, pushData) => {
    if (err) {
      log.error({ err }, 'error getting session data');
      return;
    }

    if (!pushData) {
      return;
    }

    if (!pushData.pushEndpoint) {
      return;
    }

    const id = uuid.v4();
    const mentioned = new RegExp(`@${escapeRegExp(pushData.handle)}`).test(message);
    const renotify = options.renotify || mentioned;
    const payload = JSON.stringify({
      message: message.substring(0, 255),
      handle: senderData.handle,
      room: senderData.name,
      renotify,
      context: options.context || 'message',
      id,
    });

    push(pushData.pushEndpoint, pushData.pushTTL, pushData.pushKey, pushData.pushAuth, payload);
  });
};
