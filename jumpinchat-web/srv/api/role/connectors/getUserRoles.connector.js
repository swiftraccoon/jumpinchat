
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import { NotFoundError } from '../../../utils/error.util.js';
import getUserRoles from '../controllers/getUserRoles.controller.js';
const log = logFactory({ name: 'getRoomRole.connector' });
export default async function getUserRolesConnector(req, res) {
  const { roomName, userListId } = req.params;

  try {
    const roles = await getUserRoles({ roomName, userListId });

    return res.status(200).send(roles);
  } catch (err) {
    if (err.name === NotFoundError.name) {
      log.error({ err }, 'failed to get roles');
      return res.status(400).send(err.message);
    }

    log.fatal({ err }, 'failed to get roles');
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
