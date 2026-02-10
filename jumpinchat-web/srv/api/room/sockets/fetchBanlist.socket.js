/**
 * Created by Zaccary on 28/05/2016.
 */



import logFactory from '../../../utils/logger.util.js';
import roomController from '../room.controller.js';
import RoomUtils from '../room.utils.js';
import { PermissionError } from '../../../utils/error.util.js';
import { getUserHasRolePermissions } from '../../role/role.utils.js';
const log = logFactory({ name: 'fetchBanlist.socket' });
export default function fetchBanlistSocket(socket) {
  return async function fetchBanlist() {
    let socketData;
    try {
      socketData = await RoomUtils.getSocketCacheInfo(socket.id);
    } catch (err) {
      return socket.emit('client::error', {
        context: 'banner',
        message: 'server error',
      });
    }

    try {
      await getUserHasRolePermissions(socketData.name, { userId: socketData.userId }, 'ban');
    } catch (err) {
      if (err instanceof PermissionError) {
        return socket.emit('client::error', {
          context: 'alert',
          message: 'you do not have permission to do this',
        });
      }

      return socket.emit('client::error', {
        context: 'banner',
        message: 'server error',
      });
    }

    return roomController.fetchBanlist(socketData.name, (err, banlist) => {
      if (err) {
        return socket.emit('client::error', {
          context: 'banner',
          error: err,
          message: 'could not get banlist',
        });
      }

      return socket.emit('client::banlist', {
        list: banlist,
      });
    });
  };
};
