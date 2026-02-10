/**
 * Created by Zaccary on 19/10/2015.
 */

import RoomModel from '../room.model.js';
import roomUtils from '../room.utils.js';
import { removePlaylistByRoomId } from '../../youtube/playlist.utils.js';
import logFactory from '../../../utils/logger.util.js';
const log = logFactory({ name: 'room.remove' });
import { removeRoomRoles, removeRoomEnrollments } from '../../role/role.utils.js';

/**
 * Remove room and associated data.
 *
 * @param {object} roomData
 * @param {string} roomData.name - room name
 *
 * @callback
 */
export default async function removeRoom(roomData, cb) {
  let room;

  try {
    room = await roomUtils.getRoomByName(roomData.name);
  } catch (err) {
    log.error({ roomName: roomData.name }, 'failed to remove room');
    return cb(err);
  }

  if (!room.attrs.janusServerId) {
    log.error({ roomName: room.name }, 'janus server ID missing');
    return cb();
  }

  const {
    janusServerId,
    janus_id: janusId,
  } = room.attrs;

  try {
    await roomUtils.removeJanusRoom(janusServerId, janusId);
  } catch (err) {
    log.fatal({ err }, 'error removing janus room');
    return cb(err);
  }
  try {
    await removePlaylistByRoomId(room._id);
    log.info({ room: room._id }, 'removed playlist');
  } catch (err) {
    log.fatal({ err }, 'error removing playlist document');
  }

  if (!room.attrs.owner) {
    log.debug('removing empty guest room');

    try {
      await removeRoomRoles(room._id);
    } catch (err) {
      log.fatal({ err, room: room._id }, 'failed to remove room roles');
      return cb(err);
    }

    try {
      await removeRoomEnrollments(room._id);
    } catch (err) {
      log.fatal({ err, room: room._id }, 'failed to remove user enrollments');
      return cb(err);
    }

    try {
      await RoomModel.deleteOne({ _id: room._id }).exec();
      return cb(null);
    } catch (err) {
      log.fatal({ err }, 'error removing room document');
      return cb(err);
    }
  }

  room.attrs.janusServerId = null;
  room.attrs.janus_id = null;

  return room.save()
    .then(savedRoom => cb(null, savedRoom))
    .catch(err => cb(err));
};
