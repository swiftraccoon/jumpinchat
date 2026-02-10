import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import removeRoomRole from '../controllers/removeRoomRole.controller.js';
const log = logFactory({ name: 'removeRoomRole.connector' });
import { ValidationError, PermissionError, NotFoundError } from '../../../utils/error.util.js';

export default async function removeRoomRoleConnector(req, res) {
  const { roleId, roomName } = req.params;

  const { _id: userId } = req.user;
  try {
    await removeRoomRole({ roleId, roomName, userId });

    return res.status(204).send();
  } catch (err) {
    if (err instanceof ValidationError) {
      log.warn({ err });
      return res.status(400).send(err.message);
    }

    if (err instanceof PermissionError) {
      log.warn({ err });
      return res.status(403).send(err.message);
    }

    if (err instanceof NotFoundError) {
      log.error({ err });
      return res.status(404).send(err.message);
    }

    log.error({ err });
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
