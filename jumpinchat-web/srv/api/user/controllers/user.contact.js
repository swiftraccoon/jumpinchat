
import * as uuid from 'uuid';
import logFactory from '../../../utils/logger.util.js';
import email from '../../../config/email.config.js';
const log = logFactory({ name: 'user.verifyEmail' });
export default function contactForm(req, res) {
  const {
    message,
    email: from,
    option,
    name,
  } = req.body;

  email.sendMail({
    to: 'contact@example.com',
    from: 'no-reply@jumpin.chat',
    replyTo: `${name ? `${name} ` : ''}${from}`,
    subject: `${option}: ${uuid.v4()}`,
    text: message,
  }, (err) => {
    if (err) {
      log.fatal({ err }, 'failed to send contact form email');
      return res.status(500).send();
    }

    return res.status(200).send();
  });
};
