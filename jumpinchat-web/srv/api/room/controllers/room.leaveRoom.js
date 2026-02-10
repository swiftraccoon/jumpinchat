/**
 * Created by Zaccary on 20/10/2015.
 */


import logFactory from '../../../utils/logger.util.js';
import redisUtil from '../../../utils/redis.util.js';
import janusUtil from '../../../lib/janus.util.js';
import roomUtils from '../room.utils.js';
import { NotFoundError } from '../../../utils/error.util.js';
const log = logFactory({ name: 'room.leaveRoom' });
export default async function leaveRoom(socketId, cb) {
  let socketData;

  try {
    socketData = await redisUtil.callPromise('hgetall', socketId);
  } catch (err) {
    log.fatal({ err }, 'failed to fetch session data');
    return cb(new Error('server error'));
  }

  if (!socketData) {
    return cb(new NotFoundError('Error fetching session'));
  }

  const {
    janusServerId,
    janusSessionId,
  } = socketData;

  if (janusSessionId) {
    try {
      await janusUtil.destroySession(janusServerId, janusSessionId);
    } catch (err) {
      log.fatal({ err }, 'failed to remove janus session');
    }
  }

  const removeUserCb = async (err, user) => {
    if (err) {
      log.error({ err }, 'error removing user');
      return cb(err);
    }

    if (!user) {
      return cb(new NotFoundError('user not found'));
    }

    log.debug('removed user');

    try {
      const updatedSocketData = {
        ...socketData,
        disconnected: true,
      };
      await redisUtil.callPromise('hmset', socketId, updatedSocketData);
      await redisUtil.callPromise('expire', socketId, 60 * 60 * 10);
    } catch (err) {
      return cb(err);
    }

    log.debug({ socketId }, 'socket disconnected, setting expire on session data');
    return cb(null, socketData.name, user);
  };

  return roomUtils.addToRemoveUserQueue(socketId, socketData.name, removeUserCb);
};
