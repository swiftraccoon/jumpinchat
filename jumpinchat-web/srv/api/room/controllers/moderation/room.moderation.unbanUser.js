/**
 * Created by Zaccary on 24/01/2016.
 */


/**
 * Ban a user.
 * Banned users are added to the room's banlist, which
 * is checked whilst joining a room. Banned users will
 * not be allowed to complete the join process.
 *
 * @param {string} roomName the name of the room to ban from
 * @param {string} banlistId the ID banlist item
 * @param {function} cb
 */
import { getRoomByName } from '../../room.utils.js';
import logFactory from '../../../../utils/logger.util.js';
const log = logFactory({ name: 'room.moderation.unbanUser' });
export default async function unbanUser(roomName, banlistId, cb) {
  let room;
  try {
    room = await getRoomByName(roomName);
  } catch (err) {
    return cb(err);
  }

  room.banlist = room.banlist.filter(banned => String(banned._id) !== banlistId);

  try {
    const savedRoom = await room.save();
    return cb(null, savedRoom.banlist.map(banItem => ({
      _id: banItem._id,
      handle: banItem.handle,
      timestamp: new Date(banItem.timestamp).toISOString(),
    })));
  } catch (err) {
    return cb(err);
  }
};
