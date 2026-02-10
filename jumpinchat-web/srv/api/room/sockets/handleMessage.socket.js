/**
 * Created by Zaccary on 24/05/2016.
 */


import { formatDistance } from 'date-fns';
import logFactory from '../../../utils/logger.util.js';
import RoomUtils from '../room.utils.js';
import utils from '../../../utils/utils.js';
import socketFloodProtect from '../../../utils/socketFloodProtect.js';
import sendPush from '../utils/room.utils.sendPush.js';
const log = logFactory({ name: 'handleMessage.socket' });
export default function handleMessageSocket(socket, io) {
  return async function handleMessage(msg) {
    try {
      await socketFloodProtect(socket);
    } catch (err) {
      log.error({ err }, 'socket flood failed');
      return socket.emit('client::error', utils.messageFactory({
        context: 'chat',
        message: err.message || 'An unexpected server error occurred',
        error: err.name,
      }));
    }

    if (!msg.message || typeof msg.message !== 'string') {
      return socket.emit('client::error', utils.messageFactory({
        context: 'chat',
        message: 'Can not send empty message',
        error: 'ERR_NO_MESSAGE',
      }));
    }

    return RoomUtils.getSocketCacheInfo(socket.id, async (err, data) => {
      if (err) {
        log.error({ err }, 'error getting session data');
        return socket.emit('client::error', utils.messageFactory({
          context: 'chat',
          message: 'no session, try refreshing',
          error: 'ENOSESSION',
        }));
      }

      if (!data) {
        log.error('missing session data');
        return socket.emit('client::error', utils.messageFactory({
          context: 'chat',
          message: 'no session, try refreshing',
          error: 'ENOSESSION',
        }));
      }

      if (data.disconnected === 'true') {
        return socket.emit('client::error', utils.messageFactory({
          context: 'chat',
          message: 'no session, try refreshing',
          error: 'ENOSESSION',
        }));
      }

      const {
        name: roomName,
        handle,
        color,
        userListId,
      } = data;

      try {
        const userSilencedTtl = await RoomUtils.checkUserSilenced(data.userListId);

        if (userSilencedTtl) {
          return socket.emit('client::error', utils.messageFactory({
            context: 'chat',
            message: `You are silenced, wait ${formatDistance(0, userSilencedTtl, { includeSeconds: true })}`,
            error: 'ERR_SRV',
          }));
        }

        io.in(roomName).fetchSockets().then((sockets) => {
          sockets
            .filter(s => s.id !== socket.id)
            .forEach(s => sendPush(msg.message.substring(0, 255), data, s.id));
        }).catch((err) => {
          log.fatal({ err }, 'error fetching socket room clients');
        });

        const message = utils.messageFactory({
          handle,
          color,
          userId: userListId,
          message: msg.message.substring(0, 255),
        });

        return io.to(roomName).emit('room::message', message);
      } catch (err) {
        log.fatal({ err }, 'error checking if user is silenced');
        return socket.emit('client::error', utils.messageFactory({
          context: 'chat',
          message: 'error sending message',
          error: 'ERR_SRV',
        }));
      }
    });
  };
};
