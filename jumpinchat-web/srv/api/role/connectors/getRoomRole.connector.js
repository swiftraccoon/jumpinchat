
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import getRoomRole from '../controllers/getRoomRole.controller.js';
import { getRoomIdFromName } from '../../room/room.utils.js';
const log = logFactory({ name: 'getRoomRole.connector' });
export default async function getRoomRolesConnector(req, res) {
  const { roomName, roleId } = req.params;
  const { tag } = req.query;
  let roomId;


  try {
    const result = getRoomIdFromName(roomName);

    if (!result) {
      return res.status(404).send('Room not found');
    }

    ({ _id: roomId } = result);
  } catch (err) {
    return res.status(500).send(errors.ERR_SRV.message);
  }

  try {
    const role = await getRoomRole({ roomId, tag, roleId });

    if (!role) {
      return res.status(404).send('Role not found');
    }

    return res.status(200).send(role);
  } catch (err) {
    log.fatal({ err }, 'failed to get role');
    return res.status(500).send(errors.ERR_SRV.message);
  }
};
