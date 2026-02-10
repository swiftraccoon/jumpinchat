import logFactory from '../../../utils/logger.util.js';
import ignoreUserController from '../controllers/room.ignoreUser.js';
import errors from '../../../config/constants/errors.js';
import utils from '../../../utils/utils.js';
const log = logFactory({ name: 'ignoreUser.socket' });
import { getRoomByName, getIgnoredUsersInRoom } from '../room.utils.js';

export default function ignoreUserSocket(socket, io) {
  return function ignoreUser({ userListId, roomName }) {
    log.debug({ userListId, roomName }, 'ignore user');
    ignoreUserController(roomName, socket.id, userListId, async (err, ignoreData) => {
      if (err) {
        return socket.emit('client::error', {
          context: 'banner',
          ...err,
        });
      }

      const { session } = socket.handshake;

      if (!session.ignoreList.some(i => i.sessionId === ignoreData.sessionId)) {
        session.ignoreList = [
          ...session.ignoreList,
          ignoreData,
        ];

        session.save();
      }

      try {
        const room = await getRoomByName(roomName);

        const ignoredMessage = utils.messageFactory({
          timestamp: new Date(),
          message: `You have ignored ${ignoreData.handle}`,
        });

        socket.emit('room::status', ignoredMessage);

        return socket.emit('room::updateIgnore', {
          ignoreList: getIgnoredUsersInRoom(room, session.ignoreList),
        });
      } catch (err) {
        return socket.emit('client::error', {
          context: 'alert',
          ...errors.ERR_SRV,
        });
      }
    });
  };
};
