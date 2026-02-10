
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import RoomUtils from '../room.utils.js';
const log = logFactory({ name: 'isStillJoined.socket' });
export default function isStillJoinedSocket(socket) {
  return function isStillJoined(msg) {
    const {
      room: roomName,
    } = msg;

    return RoomUtils.getRoomByName(roomName, (err, room) => {
      if (err) {
        log.fatal({ err }, 'error getting room');
        return;
      }

      if (!room) {
        log.error({ roomName }, 'Can not check connection, room has gone');
        return socket.emit(
          'client::error',
          utils.messageFactory({
            context: 'chat',
            message: 'Room no longer exists, please refresh.',
          }),
        );
      }

      const user = room.users.find(u => u.socket_id === socket.id);

      return RoomUtils.getSocketCacheInfo(socket.id, (err, socketInfo) => {
        if (err) {
          log.fatal({ err }, 'Error fetching socket cache info');
          return socket.emit(
            'client::error',
            utils.messageFactory({
              context: 'chat',
              message: 'Session no longer exists, please refresh.',
            }),
          );
        }

        if (!socketInfo || !user) {
          log.warn('User no longer connected, disconnecting');
          return socket.emit('client::forceDisconnect');
        }

        return socket.emit('client::stillConnected');
      });
    });
  };
};
