/**
 * Created by Zaccary on 24/05/2016.
 */


import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import roomController from '../room.controller.js';
import RoomUtils from '../room.utils.js';
import { markSocketRecoverable, RECONNECT_GRACE_MS } from '../../../utils/socketRecovery.util.js';
const log = logFactory({ name: 'handleDisconnect.socket' });
export default function handleDisconnectSocket(socket, io) {
  let cleanupTimer;
  /**
   * Disconnect a user from a room
   *
   * @param {object} user - the user object
   */
  function leaveRoom() {
    roomController.leaveRoom(socket.id, (err, roomName, user) => {
      if (err) {
        log.error({ err }, 'error leaving room');
        return;
      }

      if (!user) {
        log.warn('no user');
        return;
      }

      io.to(roomName).emit('room::status', utils.messageFactory({
        message: `${user.handle} has left the room`,
      }));

      io.to(roomName).emit('room::disconnect', {
        user: RoomUtils.filterRoomUser(user),
      });
    });
  }

  async function finishDisconnect() {
    try {
      const data = await RoomUtils.getSocketCacheInfo(socket.id);
      if (!data?.name) return;
      const room = await RoomUtils.getRoomByName(data.name);
      if (!room?.users.some(user => user.socket_id === socket.id)) return;
      leaveRoom();
    } catch (err) {
      log.error({ err, socketId: socket.id }, 'failed to check disconnected socket');
    }
  }

  return async function handleDisconnect(reason) {
    clearTimeout(cleanupTimer);
    log.debug({ socketId: socket.id, reason }, 'Socket disconnected');
    if (!['transport close', 'transport error', 'ping timeout'].includes(reason)) {
      return leaveRoom();
    }
    try {
      await markSocketRecoverable(socket.id);
    } catch (err) {
      log.error({ err, socketId: socket.id }, 'failed to retain reconnecting socket');
    }
    cleanupTimer = setTimeout(finishDisconnect, RECONNECT_GRACE_MS);
    cleanupTimer.unref?.();
  };
};
