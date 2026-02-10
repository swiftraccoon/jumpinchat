
import logFactory from '../../../utils/logger.util.js';
import Joi from 'joi';
import userUtils from '../user.utils.js';
const log = logFactory({ name: 'user.settings' });
export default function settings(req, res) {
  const schema = Joi.object().keys({
    playYtVideos: Joi.boolean().default(false),
    allowPrivateMessages: Joi.boolean().default(false),
    pushNotificationsEnabled: Joi.boolean().default(false),
    receiveUpdates: Joi.boolean().default(false),
    receiveMessageNotifications: Joi.boolean().default(false),
    darkTheme: Joi.boolean().default(false),
  });

  const { error, value: validated } = schema.validate(req.body);
  if (error) {
    log.warn('settings body invalid', error);
    return res.status(400).send({
      error: 'ERR_INVALID_BODY',
      message: 'Settings are invalid',
    });
  }

  userUtils.getUserById(req.params.id, (err, user) => {
    if (err) {
      log.fatal({ err }, 'error getting user');
      return res.status(403).send({ error: 'ERR_SRV', message: 'Server error' });
    }

    if (!user) {
      log.warn('Could not find user');
      return res.status(404).send({ error: 'ERR_NO_USER', message: 'Could not find user' });
    }

    user.settings = {
      ...user.settings,
      ...validated,
    };

    user.save()
      .then(() => {
        log.debug('saved user settings');
        res.status(200).send();
      })
      .catch((saveErr) => {
        log.fatal({ err: saveErr }, 'error saving user');
        res.status(500).send({ error: 'ERR_SRV', message: 'Server error' });
      });
  });
};
