import url from 'url';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { api } from '../../constants/constants.js';
import logFactory from '../../utils/logger.js';
import request from '../../utils/request.js';

const log = logFactory({ name: 'settings.account.mfa' });

export default async function mfaEnroll(req, res) {
  const { locals } = res;
  const { error } = req.query;

  locals.section = 'Enroll MFA';
  locals.description = 'Secure your account by enrolling in MFA';
  locals.user = req.user;
  locals.mfaQr = null;
  locals.error = error || null;

  // Init phase
  if (!locals.user) {
    return res.redirect('/');
  }

  const token = jwt.sign(String(req.user._id), config.auth.jwtSecret);

  if (!locals.mfaQr) {
    try {
      const response = await request({
        method: 'GET',
        url: `${api}/api/user/mfa/request`,
        json: true,
        headers: {
          Authorization: token,
        },
      });

      locals.mfaQr = response.qrUrl;
    } catch (err) {
      if (err.message) {
        locals.error = 'Failed to request enrollment information';
      } else {
        locals.error = err;
      }
    }
  }

  // POST handling
  if (req.method === 'POST' && req.body.action === 'verify') {
    locals.error = null;
    const schema = Joi.object({
      token: Joi.string().min(6).max(6).required(),
    });

    const { error: validationError } = schema.validate({ token: req.body.token });

    if (validationError) {
      locals.error = 'invalid token';
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    try {
      await request({
        method: 'POST',
        url: `${api}/api/user/mfa/confirm`,
        json: true,
        body: { token: req.body.token },
        headers: {
          Authorization: token,
        },
      });
    } catch (err) {
      if (!err.message) {
        locals.error = err;
      } else {
        locals.error = 'failed to confirm enrollment';
      }

      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    req.session.user = null;
    req.session.hasGeneratedBackupCodes = false;

    return res.redirect('/settings/account/mfa/backup');
  }

  return res.render('mfaEnroll');
}
