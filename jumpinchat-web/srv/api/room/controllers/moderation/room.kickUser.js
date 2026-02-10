
import RoomUtils from '../../room.utils.js';
import logFactory from '../../../../utils/logger.util.js';
import { createError } from '../../../../utils/utils.js';
import errors from '../../../../config/constants/errors.js';
import config from '../../../../config/env/index.js';
const log = logFactory({ name: 'room.kickUser' });
const getOperator = (room, userToBan) => room.settings.moderators
  .find(m => String(m._id) === String(userToBan.operator_id));

export default function kickUser(req, res) {
  const { sessionStore, sessionID } = req;
  checkOperatorPermissions(socket.id, 'kick', (err, userIsMod) => {
    if (err) {
      log.fatal({ err }, 'error muting user chat');
      return socket.emit('client::error',
        {
          context: 'banner',
          error: err,
          message: 'error silencing user',
        });
    }

    if (!userIsMod) {
      return socket.emit('client::error',
        {
          context: 'alert',
          error: err,
          message: 'you do not have permissions to do this',
        });
    }
  });
};
