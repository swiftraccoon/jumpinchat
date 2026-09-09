const nodemailer = require('nodemailer');
const config = require('../../config/env');
const log = require('../../utils/logger')({ name: 'api.email.send' });

// create Nodemailer SMTP transporter
const transportOpts = {
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
};

if (config.smtp.user) {
  transportOpts.auth = {
    user: config.smtp.user,
    pass: config.smtp.pass,
  };
}

const transporter = nodemailer.createTransport(transportOpts);

const defaults = {
  from: config.smtp.from || 'JumpInChat <noreply@example.com>',
};

function createSendController({ transport = transporter } = {}) {
  return async function sendEmail(req, res) {
    const {
      from,
      to,
      subject,
      html,
      text,
      replyTo,
    } = req.body || {};

    if (!from) {
      log.debug({ from: defaults.from }, 'Missing mail source, using default');
    }

    if (!to) {
      log.error('Missing mail destination');
      return res.status(400).send('Missing mail destination');
    }

    if (!subject) {
      log.error('Missing mail subject');
      return res.status(400).send('Missing mail subject');
    }

    if (!text && !html) {
      log.error('Missing mail body');
      return res.status(400).send('Missing mail body');
    }

    const mailOpts = {
      ...defaults,
      from: from || defaults.from,
      to,
      subject,
      replyTo,
  };

  if (html) {
    mailOpts.html = html;
  } else {
    mailOpts.text = text;
  }

  try {
    await transport.sendMail(mailOpts);
    return res.status(200).send();
  } catch (err) {
    log.error({ err }, 'SMTP delivery failed');
    return res.status(502).send('Email delivery failed');
  }
  };
}

module.exports = createSendController();
module.exports.createSendController = createSendController;
