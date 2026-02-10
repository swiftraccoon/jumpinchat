
import logFactory from '../../../utils/logger.util.js';
import roleUtils from '../role.utils.js';
const log = logFactory({ name: 'getRoomRoles.controller' });
export default async function getRolesController(roomId) {
  log.debug({ roomId }, 'getRolesController');
  return roleUtils.getAllRoomRoles(roomId);
};
