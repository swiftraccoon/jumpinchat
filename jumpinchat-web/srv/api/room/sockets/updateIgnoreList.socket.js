import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'updateIgnoreList.socket' });
import { getRoomByName, getIgnoredUsersInRoom } from '../room.utils.js';

export default function updateIgnoreListSocket(socket) {
  return async function updateIgnoreList({ roomName }) {
    const { ignoreList } = socket.handshake.session;
    try {
      const room = await getRoomByName(roomName);
      return socket.emit('room::updateIgnore', {
        ignoreList: getIgnoredUsersInRoom(room, ignoreList),
      });
    } catch (err) {
      log.fatal({ err, roomName }, 'error fetching room');
      return socket.emit('client::error', {
        context: 'alert',
        ...errors.ERR_SRV,
      });
    }
  };
};
