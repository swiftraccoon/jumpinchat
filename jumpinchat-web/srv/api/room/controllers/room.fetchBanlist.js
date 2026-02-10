/**
 * Created by Zaccary on 28/05/2016.
 */



import logFactory from '../../../utils/logger.util.js';
import { getRoomByName } from '../room.utils.js';
const log = logFactory({ name: 'room.fetchBanlist' });
export default async function fetchBanlist(roomName, cb) {
  let room;
  try {
    room = await getRoomByName(roomName);
  } catch (err) {
    log.error({ err }, 'failed to get room');
    return cb(err);
  }

  const filteredBanlist = room.banlist
    .map(banItem => ({
      _id: banItem._id,
      handle: banItem.handle,
      timestamp: new Date(banItem.timestamp).toISOString(),
      username: banItem.user_id && banItem.user_id.username,
    }))
    .reverse();

  return cb(null, filteredBanlist);
};
