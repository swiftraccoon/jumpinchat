import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import createRole from '../controllers/createRole.controller.js';
const log = logFactory({ name: 'createRole.connector' });
import { NotFoundError, PermissionError, ValidationError } from '../../../utils/error.util.js';

export default async function createRoleConnector(req, res) {
  const {
    name,
    tag,
    roomName,
  } = req.body;

  try {
    const role = await createRole({
      name,
      tag,
      roomName,
      userId: req.user._id,
    });

    return res.status(201).send(role);
  } catch (err) {
    if (err.name === ValidationError.name) {
      return res.status(400).send(err.message);
    }

    if (err.name === NotFoundError.name) {
      return res.status(404).send(err.message);
    }

    if (err.name === PermissionError.name) {
      return res.status(403).send(err.message);
    }

    log.error({ err: err.message });
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
