
import logFactory from '../../../utils/logger.util.js';
import userUtils from '../../user/user.utils.js';
import roomUtils from '../../room/room.utils.js';
const log = logFactory({ name: 'utils' });
export default function removeUser(req, res) {
  const { userId } = req.params;

  return userUtils.removeUser(userId, (err) => {
    if (err) {
      log.fatal({ err }, 'failed to remove user');
      return res.status(500).send();
    }

    log.info({ userId }, 'removed user');

    return roomUtils.removeRoomByUserId(userId, (err) => {
      if (err) {
        log.fatal({ err }, 'failed to remove room');
        return res.status(500).send();
      }

      log.info({ userId }, 'removed room');

      return res.status(204).send();
    });
  });
};
