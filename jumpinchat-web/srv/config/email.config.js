
import axios from 'axios';
import inlineCss from 'inline-css';
import logFactory from '../utils/logger.util.js';
import config from './env/index.js';
import emailUtils from '../api/email/email.utils.js';
const log = logFactory({ name: 'email.config' });
const prepareEmail = function prepareEmail(html, cb) {
  const opts = {
    url: 'https://jumpin.chat',
  };

  return inlineCss(html, opts)
    .then(parsedHtml => cb(null, parsedHtml))
    .catch(err => cb(err));
};

function postMail(message) {
  return axios({
    method: 'post',
    url: `${config.emailServiceUri}/email/send`,
    data: message,
    headers: {
      Authorization: config.auth.sharedSecret,
    },
  });
}

export async function sendMail(message, cb = () => {}) {
  if (!message.to) {
    log.error('Missing mail destination');
    return cb(new Error('Missing mail destination'));
  }

  if (!message.subject) {
    log.error('Missing mail subject');
    return cb(new Error('Missing mail subject'));
  }

  if (!message.text && !message.html) {
    log.error('Missing mail body');
    return cb(new Error('Missing mail body'));
  }

  try {
    const isInBlacklist = await emailUtils.getBlacklistItem(message.to);
    if (isInBlacklist) {
      log.info({ address: message.to }, 'email address in blacklist, skipping');
      return cb();
    }
  } catch (err) {
    return cb(err);
  }

  try {
    await emailUtils.checkEmailDomain(message.to);
  } catch (err) {
    return cb(err);
  }

  if (message.text) {
    try {
      const response = await postMail(message);
      return cb();
    } catch (err) {
      log.fatal({ err }, 'error sending email');
      return cb(err);
    }
  }

  return prepareEmail(message.html, async (err, preparedHtml) => {
    if (err) {
      log.fatal({ err }, 'error preparing email');
      return cb(err);
    }

    const preparedMessage = Object.assign({}, message, { html: preparedHtml });
    try {
      await postMail(preparedMessage);
      return cb();
    } catch (err) {
      log.fatal({ err }, 'error sending email');
      return cb(err);
    }
  });
};

export default { sendMail };
