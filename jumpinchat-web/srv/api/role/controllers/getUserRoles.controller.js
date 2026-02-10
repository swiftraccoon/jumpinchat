
/**
 * getUserRoles
 *
 * @param {object} body
 * @param {string} body.userListId
 * @param {string} body.roomName
 *
 * @return {array} []roles
 */
import logFactory from '../../../utils/logger.util.js';
import { NotFoundError } from '../../../utils/error.util.js';
import { getUserEnrollments } from '../role.utils.js';
const log = logFactory({ name: 'getUserRoles.controller' });
export default async function getUserRoles(body) {
  // Dynamic import to break circular dependency: room.utils → checkOperatorPermissions → getUserRoles → room.utils
  const { default: roomUtils } = await import('../../room/room.utils.js');
  const { getRoomByName } = roomUtils;
  const { userListId, roomName } = body;
  let room;
  let roles;

  try {
    log.debug({ getRoomByName: typeof getRoomByName });
    room = await getRoomByName(roomName);
  } catch (err) {
    throw err;
  }

  if (!room) {
    throw new NotFoundError(`Room "${roomName}" not found`);
  }

  const roomUser = room.users.find(u => userListId === String(u._id));

  if (!roomUser) {
    throw new NotFoundError('User not found in room');
  }

  try {
    const {
      userId,
      session_id: sessionId,
      ip,
    } = roomUser;

    roles = await getUserEnrollments({
      userId,
      sessionId,
      ip,
      room: room._id,
    });
  } catch (err) {
    throw err;
  }

  return roles;
};
