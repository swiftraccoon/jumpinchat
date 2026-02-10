
import logFactory from '../../../utils/logger.util.js';
import Joi from 'joi';
import userUtils from '../user.utils.js';
const log = logFactory({ name: 'user.settings' });
export default function setNotificationsEnabled(req, res) {
  const schema = Joi.object().keys({
    enabled: Joi.boolean(),
  });

  const { error, value: validated } = schema.validate(req.body);
  if (error) {
    log.warn('settings body invalid', error);
    return res.status(400)
      .send({
        error: 'ERR_INVALID_BODY',
        message: 'Invalid body',
      });
  }

  userUtils.getUserById(req.params.userId, (err, user) => {
    if (err) {
      log.fatal({ err }, 'error getting user');
      return res.status(403).send({ error: 'ERR_SRV', message: 'Server error' });
    }

    if (!user) {
      log.warn('Could not find user');
      return res.status(404).send({ error: 'ERR_NO_USER', message: 'Could not find user' });
    }

    user.settings.pushNotificationsEnabled = validated.enabled;

    return user.save()
      .then(() => res.status(200).send())
      .catch((saveErr) => {
        log.fatal({ err: saveErr }, 'error saving user');
        res.status(500).send({ error: 'ERR_SRV', message: 'Server error' });
      });
  });
};
