import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import { getUserByEmail } from '../../user/user.utils.js';
const log = logFactory({ name: 'admin.bounceNotification' });
import { addToBlacklist } from '../../email/email.utils.js';


export default function bounceNotification(req, res) {
  const message = req.body;
  const type = message.bounce ? 'bounce' : 'complaint';
  const recipients = message.bounce ? 'bouncedRecipients' : 'complainedRecipients';

  if (!message[type] || !message[type][recipients]) {
    log.error({ message }, 'invalid bounce notification format');
    return res.status(400).send({ error: 'Invalid bounce notification format' });
  }

  message[type][recipients].forEach(({ emailAddress }) => getUserByEmail(emailAddress, (err, user) => {
    if (err) {
      log.fatal({ err }, 'failed to get user by email');
      return;
    }

    if (!user) {
      log.error({ emailAddress }, 'user does not exist');
      return;
    }

    user.auth.email_is_verified = false;
    user.save()
      .then(async () => {
        try {
          log.info({ emailAddress }, 'blacklisting bounced address');
          await addToBlacklist(message);
        } catch (blErr) {
          log.fatal({ err: blErr }, 'error adding to blacklist');
        }

        log.info({ emailAddress }, 'email unverified');
      })
      .catch((saveErr) => {
        log.fatal({ err: saveErr }, 'failed to save user');
      });
  }));

  if (config.env === 'production') {
    log.info({ data: message }, `email ${type}`);
  }

  return res.status(204).send();
};
