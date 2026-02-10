/**
 * Created by Zaccary on 24/05/2016.
 */


import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import roomController from '../room.controller.js';
import RoomUtils from '../room.utils.js';
const log = logFactory({ name: 'handleDisconnect.socket' });
export default function handleDisconnectSocket(socket, io) {
  /**
   * Disconnect a user from a room
   *
   * @param {object} user - the user object
   */
  return function handleDisconnect() {
    log.debug({ socketId: socket.id }, 'Socket disconnected');
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
  };
};
