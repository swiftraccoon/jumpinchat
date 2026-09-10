/**
 * Created by Zaccary on 24/10/2015.
 */


import logFactory from '../../../utils/logger.util.js';
import roomController from '../room.controller.js';
import roomUtils from '../room.utils.js';
import redisFactory from '../../../lib/redis.util.js';
import { retainConnectedUsers } from '../../../utils/socketRecovery.util.js';
const log = logFactory({ name: 'room.sanitize' });
const redis = redisFactory();
const clearOldSessionData = (socketId) => {
  redis.del(socketId).then(() => {
    log.debug({ socketId }, 'removed old session data');
  }).catch((err) => {
    log.fatal({ err, socketId }, 'failed to remove session data');
  });
};

/**
 * remove all users who's sockets have disconnected
 *
 * @param name
 * @param cb
 */
export default function sanitizeUserList(name, cb) {
  log.debug({ roomName: name }, 'sanitizeUserList');
  const io = roomController.getSocketIo();

  io.in(name).fetchSockets().then((sockets) => {
    const clients = sockets.map(s => s.id);

    log.debug({ clients, roomName: name }, 'socketio clients');

    roomUtils.getRoomByName(name, async (err, room) => {
      if (err) {
        log.fatal({ err, room: name }, 'failed to fetch room');
        return cb(err);
      }

      if (!room) {
        log.debug({ room: name }, 'room has already been removed');
        return cb(null);
      }

      let retained;
      try {
        retained = await retainConnectedUsers(room.users, clients);
      } catch (err) {
        return cb(err);
      }
      const usersToBeRemoved = room.users
        .filter(user => !retained.includes(user))
        .map(user => user.socket_id)
        .filter(socket => !clients.includes(socket));

      log.debug({ usersToBeRemoved }, 'removing sockets');

      usersToBeRemoved
        .forEach((socket) => {
          log.debug({ socket }, 'removing socket');
          roomController.leaveRoom(socket, (err) => {
            if (err) {
              log.error({ err, socket }, 'failed to force socket out of the room');
              const removeUserCb = (err) => {
                if (err) {
                  log.error({ err }, 'failed to remove user from room');
                }
              }

              if (err === 'ERR_NO_DATA') {
                roomUtils.addToRemoveUserQueue(socket, name, removeUserCb);
              }
            } else {
              log.debug({ socket }, 'socket removed');
            }
          });

          clearOldSessionData(socket);
        });

      return cb();
    });
  }).catch(cb);
};
