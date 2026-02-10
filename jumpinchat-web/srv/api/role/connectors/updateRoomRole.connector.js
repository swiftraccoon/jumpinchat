
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import { ValidationError, PermissionError } from '../../../utils/error.util.js';
import updateRoomRoles from '../controllers/updateRoomRole.controller.js';
const log = logFactory({ name: 'updateRoomRole.connector' });
export default async function updateRoomRolesConnector(req, res) {
  const {
    roles,
  } = req.body;

  const { roomName } = req.params;

  try {
    const savedRoles = await updateRoomRoles({
      roomName,
      userId: req.user._id,
      roles,
    });

    return res.status(201).send(savedRoles);
  } catch (err) {
    if (err instanceof ValidationError) {
      log.warn({ err });
      return res.status(400).send(err.message);
    }

    if (err instanceof PermissionError) {
      log.warn({ err });
      return res.status(403).send(err.message);
    }

    log.error({ err });
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
