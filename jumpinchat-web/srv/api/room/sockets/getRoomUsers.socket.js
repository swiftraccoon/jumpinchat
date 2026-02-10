import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'getRoomUsers.socket' });
import { getRoomByName, getSocketCacheInfo, filterRoomUser } from '../room.utils.js';

export default function getRoomUsersSocket(socket) {
  return async function getRoomUsers() {
    let roomName;
    let room;
    try {
      const socketData = await getSocketCacheInfo(socket.id);
      if (!socketData) {
        return socket.emit('client::error', utils.messageFactory({
          context: 'chat',
          ...errors.ERR_NO_USER_SESSION,
        }));
      }

      roomName = socketData.name;
    } catch (err) {
      return socket.emit('client::error', utils.messageFactory({
        context: 'banner',
        ...errors.ERR_SRV,
      }));
    }

    try {
      room = await getRoomByName(roomName);
    } catch (err) {
      return socket.emit('client::error', utils.messageFactory({
        context: 'banner',
        ...errors.ERR_SRV,
      }));
    }

    if (!room) {
      return socket.emit('client::error', utils.messageFactory({
        context: 'banner',
        ...errors.ERR_NO_ROOM,
      }));
    }

    return socket.emit('room::updateUsers', {
      users: room.users.map(u => filterRoomUser(u)),
    });
  };
};
