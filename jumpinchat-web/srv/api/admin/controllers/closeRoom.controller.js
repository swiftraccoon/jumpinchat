
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import roomCloseUtils from '../../roomClose/roomClose.utils.js';
import adminUtils from '../admin.utils.js';
import adminConstants from '../admin.constants.js';
const log = logFactory({ name: 'admin.closeRoom' });
export default async function closeRoom(req, res) {
  const { roomName } = req.params;
  const {
    reason,
    duration,
  } = req.body;

  let newClose;
  try {
    newClose = await roomCloseUtils.closeRoom(roomName, reason, duration);
  } catch (err) {
    log.fatal({ err }, 'failed to close room');
    return res.status(500).send(errors.ERR_SRV);
  }

  try {
    const action = {
      type: adminConstants.activity.ROOM_CLOSE,
      id: String(newClose._id),
    };

    await adminUtils.addModActivity(req.user._id, action);
  } catch (err) {
    log.fatal({ err }, 'error adding acitivity entry');
    return res.status(500).send();
  }

  return res.status(201).send(newClose);
};
