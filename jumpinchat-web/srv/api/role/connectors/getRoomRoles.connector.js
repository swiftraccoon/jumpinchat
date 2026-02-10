
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import getRoomRoles from '../controllers/getRoomRoles.controller.js';
import { getRoomIdFromName } from '../../room/room.utils.js';
const log = logFactory({ name: 'getRoomRoles.connector' });
export default async function getRoomRolesConnector(req, res) {
  const { roomName } = req.params;
  let roomId;


  try {
    roomId = await getRoomIdFromName(roomName);
  } catch (err) {
    return res.status(500).send(errors.ERR_SRV.message);
  }

  if (!roomId) {
    return res.status(400).send(errors.ERR_NO_ROOM.message);
  }

  try {
    const roles = await getRoomRoles(roomId._id);

    return res.status(200).send(roles);
  } catch (err) {
    log.fatal({ err }, 'failed to get room roles');
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
