/**
 * Created by Zaccary on 24/05/2016.
 */


import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import roomController from '../room.controller.js';
import RoomUtils from '../room.utils.js';
const log = logFactory({ name: 'disconnectUser.socket' });
export default function disconnectUserSocket(socket, io) {
  return function disconnectUser() {
    log.debug('disconnect user');
    roomController.leaveRoom(socket.id, (err, roomName, user) => {
      if (err) {
        log.fatal({ err }, 'error leaving room');
        socket.emit('server::error',
          {
            context: 'banner',
            error: err,
          });
      }

      if (!user) {
        log.warn({ user, roomName }, 'can not find user to disconnect');
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
