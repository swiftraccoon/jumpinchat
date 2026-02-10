
import jwt from 'jsonwebtoken';
import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import userUtils from '../user.utils.js';
const log = logFactory({ name: 'user.remove' });
export default function unsubscribe(req, res) {
  return jwt.verify(req.params.token, config.auth.jwt_secret, (err, { id }) => {
    if (err) {
      log.error({ err }, 'invalid token');
      return res.status(401).send('Invalid token');
    }

    return userUtils.getUserById(id, (err, user) => {
      if (err) {
        log.fatal({ err, id }, 'failed to get user');
        return res.status(500).send();
      }

      user.settings.receiveUpdates = false;
      return user.save()
        .then(() => res.status(200).send('Successfully unsubscribed from email updates'))
        .catch((saveErr) => {
          log.fatal({ err: saveErr, id }, 'failed to save user');
          res.status(500).send();
        });
    });
  });
};
