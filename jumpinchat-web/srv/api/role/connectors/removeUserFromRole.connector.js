
import logFactory from '../../../utils/logger.util.js';
import removeUserFromRole from '../controllers/removeUserFromRole.controller.js';
import errors from '../../../config/constants/errors.js';
import { NotFoundError, PermissionError } from '../../../utils/error.util.js';
const log = logFactory({ name: 'removeUserFromRole.connector' });
export default async function removeUserFromRoleConnector(req, res) {
  const { enrollmentId, roomName } = req.params;

  try {
    await removeUserFromRole({
      enrollmentId,
      roomName,
      enrollingUser: req.user._id,
    });

    return res.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).send(err.message);
    }

    if (err instanceof PermissionError) {
      return res.status(403).send(err.message);
    }

    log.fatal({ err }, 'failed to remove user from role');
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
