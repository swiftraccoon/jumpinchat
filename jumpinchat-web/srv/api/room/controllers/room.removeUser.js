/**
 * Created by Zaccary on 19/10/2015.
 */


import logFactory from '../../../utils/logger.util.js';
import roomRemove from './room.remove.js';
const log = logFactory({ name: 'room.removeUser' });
export default async function removeUserFromRoom(socketId, roomData, cb) {
  // Lazy require to break circular dependency: room.utils → removeUser → room.utils
  const { default: RoomUtils } = await import('../room.utils.js');
  let removedUser;

  RoomUtils.getRoomByName(roomData.name, (err, room) => {
    if (err) {
      return cb(err);
    }

    if (!room) {
      return cb('ERR_NO_ROOM');
    }

    room.users = room.users.filter((user) => {
      if (user.socket_id === socketId) {
        removedUser = user;
        return false;
      }

      return true;
    });

    return room.save()
      .then((savedRoom) => {
        // if removing the user causes the room to be empty, and if
        // the room is not a user room, it should be removed.
        if (!savedRoom.users.length) {
          log.debug('room empty, attempting to remove it');
          return roomRemove(roomData, cb);
        }

        return cb(null, removedUser);
      })
      .catch((saveErr) => cb(saveErr));
  });
};
