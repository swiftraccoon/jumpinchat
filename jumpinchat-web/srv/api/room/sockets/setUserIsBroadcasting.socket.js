
import logFactory from '../../../utils/logger.util.js';
import RoomUtils from '../room.utils.js';
const log = logFactory({ name: 'setUserIsBroadcasting.socket' });
export default function setUserIsBroadcastingSocket(socket, io) {
  return function setUserIsBroadcasting(msg) {
    log.debug({ message: msg }, 'setUserIsBroadcasting');
    const getRoomNameBySocketId = () => [...socket.rooms].find(room => room !== socket.id);

    RoomUtils.getRoomByName(getRoomNameBySocketId(), (err, room) => {
      if (err) {
        log.error({ err }, 'error getting room name');
        return socket.emit(
          'client::error',
          {
            context: 'banner',
            message: 'Issues occurred during broadcast',
          },
        );
      }

      if (!room) {
        log.error({ room: msg.room }, 'unable to find room');
        return socket.emit(
          'client::error',
          {
            context: 'banner',
            message: 'Issues occurred during broadcast',
          },
        );
      }

      room.users = room.users
        .map((user) => {
          if (user.socket_id === socket.id) {
            user.isBroadcasting = msg.isBroadcasting;
          }

          return user;
        });

      return room.save()
        .then((savedRoom) => {
          const updatedUser = RoomUtils
            .filterRoomUser(savedRoom.users.find(u => u.socket_id === socket.id));

          log.info({
            handle: updatedUser.handle,
            room: savedRoom.name,
            broadcasting: msg.isBroadcasting,
          }, 'user changed broadcasting state');

          io.to(savedRoom.name).emit('room::updateUser', {
            user: updatedUser,
          });
        })
        .catch((saveErr) => {
          log.fatal({ saveErr }, 'error saving room');
        });
    });
  };
};
