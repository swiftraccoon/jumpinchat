
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import { PermissionError } from '../../../utils/error.util.js';
import RoomUtils from '../room.utils.js';
import { getUserHasRolePermissions } from '../../role/role.utils.js';
const log = logFactory({ name: 'handleKickUser.socket' });
export default function handleKickUserSocket(socket, io) {
  return async function handleKickUser(msg) {
    let socketData;
    try {
      socketData = await RoomUtils.getSocketCacheInfo(socket.id);
    } catch (err) {
      return socket.emit('client::error', {
        context: 'banner',
        error: err,
        message: 'Server error attempting to kick user.',
      });
    }
    try {
      await getUserHasRolePermissions(socketData.name, { userId: socketData.userId }, 'kick');
    } catch (err) {
      if (err instanceof PermissionError) {
        return socket.emit('client::error', {
          context: 'banner',
          error: err.name,
          message: err.message,
        });
      }

      return socket.emit('client::error', {
        context: 'banner',
        error: err,
        message: 'Server error attempting to kick user.',
      });
    }

    try {
      const room = await RoomUtils.getRoomByName(socketData.name);

      const user = room.users.find(u => String(u._id) === msg.user_list_id);

      if (!user) {
        log.error('Could not find user to kick');
        return socket.emit('client::error', {
          context: 'banner',
          error: 'NotFoundError',
          message: 'Could not find user',
        });
      }

      if (user.isAdmin) {
        return socket.emit('client::error', {
          context: 'banner',
          error: PermissionError.name,
          message: 'You can not kick an admin',
        });
      }

      if (user.isSiteMod) {
        return socket.emit('client::error', {
          context: 'banner',
          error: PermissionError.name,
          message: 'You can not kick a site moderator',
        });
      }

      const { sessionStore } = socket.handshake;
      return sessionStore.get(user.session_id, (err, session) => {
        if (err) {
          log.fatal({ err }, 'failed to get user session');
          return socket.emit('client::error', {
            context: 'banner',
            error: err,
            message: 'Could not find user',
          });
        }

        if (!session) {
          log.error({ socketId: user.session_id }, 'session does not exist');
          return socket.emit('client::error', {
            context: 'banner',
            error: err,
            message: 'Could not find user',
          });
        }

        log.debug({ session }, 'user session');

        session.kicked = true;
        return sessionStore.set(user.session_id, session, (err) => {
          if (err) {
            log.fatal({ err }, 'error saving session');
            return socket.emit('client::error', {
              context: 'banner',
              error: err,
              message: 'Server error attempting to kick user.',
            });
          }

          io.to(socketData.name).emit('room::status', utils.messageFactory({
            message: `${user.handle} was kicked by ${socketData.handle}`,
          }));

          io.to(user.socket_id).emit('self::banned');

          io.in(user.socket_id).disconnectSockets(true);

          log.debug({
            socketId: user.socket_id,
            sessionId: user.sessionId,
            room: socketData.name,
            bannedById: socketData.userListId,
          }, 'user kicked');
        });
      });
    } catch (err) {
      log.fatal({ err }, 'failed to get room');
      return socket.emit('client::error', {
        context: 'banner',
        error: err,
        message: 'Server error attempting to kick user.',
      });
    }
  };
};
