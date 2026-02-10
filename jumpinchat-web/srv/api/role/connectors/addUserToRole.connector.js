
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import { NotFoundError, PermissionError } from '../../../utils/error.util.js';
import addUserToRole from '../controllers/addUserToRole.controller.js';
const log = logFactory({ name: 'addUserToRole.connector' });
export default async function addUserToRoleConnector(req, res) {
  const {
    roomName,
    roleId,
    userListId,
    userId,
  } = req.body;

  try {
    const enrollment = await addUserToRole({
      roomName,
      roleId,
      userListId,
      userId,
      enrollingUser: req.user._id,
    });

    return res.status(201).send(enrollment);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).send(err.message);
    }

    if (err instanceof PermissionError) {
      return res.status(403).send(err.message);
    }

    log.fatal({ err }, 'failed to get role');
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
