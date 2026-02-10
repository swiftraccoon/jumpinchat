
import logFactory from '../../../utils/logger.util.js';
import { getUserById } from '../../user/user.utils.js';
import { getSocketCacheInfo } from '../room.utils.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'unignoreUser.socket' });
export default function unignoreUserController(id, socketId, cb) {
  log.debug({ id, socketId }, 'unignore user');
  return getSocketCacheInfo(socketId, async (err, socketData) => {
    if (err) {
      log.fatal({ err }, 'unable to get socket cache');
      return cb(errors.ERR_SRV);
    }

    if (socketData.userId) {
      try {
        const user = await getUserById(socketData.userId, { lean: false });
        user.settings.ignoreList = user.settings.ignoreList
          .filter(i => i.id !== id);

        return user.save()
          .then(() => cb())
          .catch((saveErr) => {
            log.fatal({ err: saveErr }, 'error saving user');
            cb();
          });
      } catch (err) {
        log.fatal({ err }, 'error fetching user');
        return cb(errors.ERR_SRV);
      }
    }

    return cb();
  });
};
