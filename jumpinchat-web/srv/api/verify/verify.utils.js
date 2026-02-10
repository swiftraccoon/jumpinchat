import * as uuid from 'uuid';
import crypto from 'crypto';
import logFactory from '../../utils/logger.util.js';
import config from '../../config/env/index.js';
import VerifyModel from './verify.model.js';
import email from '../../config/email.config.js';
const log = logFactory({ name: 'verify.utils' });
import { signUpTemplate, resetPasswordTemplate } from '../../config/constants/emailTemplates.js';

const types = {
  TYPE_EMAIL: 'email',
  TYPE_PASS_RESET: 'passwordreset',
};

export async function createEmailVerification(user, cb = () => {}) {
  try {
    await VerifyModel.findOneAndDelete({ userId: user._id, type: types.TYPE_EMAIL });
  } catch (err) {
    log.fatal({ err }, 'failed to remove existing verification entry');
    return cb(err);
  }

  const token = crypto.createHash('sha256').update(uuid.v4()).digest('hex');

  try {
    const verifyEntry = await VerifyModel.create({
      userId: user._id,
      expireDate: new Date(Date.now() + config.verification.emailTimeout),
      token,
      type: types.TYPE_EMAIL,
    });

    email.sendMail({
      to: user.auth.email,
      subject: 'Activate your JumpInChat account',
      html: signUpTemplate({ username: user.username, token: verifyEntry.token }),
    }, cb);
  } catch (err) {
    log.fatal({ err }, 'failed to create verification entry');
    return cb(err);
  }
};

export async function createPasswordReset(user, cb = () => {}) {
  if (!user.auth.email_is_verified) {
    log.warn('User attempted to reset a password with an unverified email', user._id);
    return cb();
  }

  try {
    await VerifyModel.findOneAndDelete({ userId: user._id, type: types.TYPE_PASS_RESET });
  } catch (err) {
    log.fatal({ err }, 'failed to remove existing verification entry');
    return cb(err);
  }

  const token = crypto.createHash('sha256').update(uuid.v4()).digest('hex');

  try {
    const verifyEntry = await VerifyModel.create({
      userId: user._id,
      expireDate: new Date(Date.now() + config.verification.pwResetTimeout),
      token,
      type: types.TYPE_PASS_RESET,
    });

    log.debug('sending password reset email');

    email.sendMail({
      to: user.auth.email,
      subject: 'Password reset',
      html: resetPasswordTemplate({ username: user.username, token: verifyEntry.token }),
    }, cb);
  } catch (err) {
    log.fatal({ err }, 'failed to create verification entry');
    return cb(err);
  }
};
