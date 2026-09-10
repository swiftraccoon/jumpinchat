import RoomModel from '../room.model.js';
import roomRemove from './room.remove.js';

export default async function removeUserFromRoom(socketId, roomData, cb) {
  try {
    // Compete atomically with recovery so a migrated member cannot be removed
    // by the old socket's delayed disconnect callback.
    const previous = await RoomModel.findOneAndUpdate(
      { name: roomData.name, 'users.socket_id': socketId },
      { $pull: { users: { socket_id: socketId } } },
      { returnDocument: 'before' },
    );
    if (!previous) return cb(null, null);
    const removedUser = previous.users.find(user => user.socket_id === socketId);
    if (previous.users.length === 1) {
      return roomRemove(roomData, err => cb(err, err ? undefined : removedUser));
    }
    return cb(null, removedUser);
  } catch (err) {
    return cb(err);
  }
}
