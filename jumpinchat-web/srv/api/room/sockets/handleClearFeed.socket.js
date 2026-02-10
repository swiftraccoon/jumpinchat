
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import { PermissionError } from '../../../utils/error.util.js';
import RoomUtils from '../room.utils.js';
import { getUserHasRolePermissions } from '../../role/role.utils.js';
const log = logFactory({ name: 'handleClearFeed.socket' });
export default function handleClearFeedSocket(socket, io) {
  return async function handleClearFeed() {
    let socketData;
    try {
      socketData = await RoomUtils.getSocketCacheInfo(socket.id);
    } catch (err) {
      return socket.emit('client::error', {
        context: 'banner',
        error: err,
        message: 'Server error attempting to clear feed.',
      });
    }
    try {
      await getUserHasRolePermissions(socketData.name, { userId: socketData.userId }, 'ban');
    } catch (err) {
      if (err instanceof PermissionError) {
        return socket.emit('client::error', {
          context: 'banner',
          error: err.name,
          message: err.message,
        });
      }

      log.fatal({ err }, 'failed to get role permissions');
      return socket.emit('client::error', {
        context: 'banner',
        error: err,
        message: 'Server error attempting to clear feed.',
      });
    }


    io.to(socketData.name).emit('room::clearFeed');
    return io.to(socketData.name).emit('room::status', utils.messageFactory({
      message: `${socketData.handle} cleared the chat feed`,
    }));
  };
};
