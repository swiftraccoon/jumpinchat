import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { api } from '../../constants/constants.js';
import logFactory from '../../utils/logger.js';
import request from '../../utils/request.js';

const log = logFactory({ name: 'settings.account.mfa.backup' });

export default async function mfaEnrollBackupCodes(req, res) {
  const { locals } = res;
  const { error } = req.query;

  locals.section = 'Enroll MFA';
  locals.description = 'Secure your account by enrolling in MFA';
  locals.user = req.user;
  locals.error = error || null;

  // Init phase
  if (!locals.user) {
    return res.redirect('/');
  }

  if (!locals.user.auth.totpSecret || req.session.hasGeneratedBackupCodes) {
    return res.redirect('/');
  }

  const token = jwt.sign(String(req.user._id), config.auth.jwtSecret);

  try {
    const response = await request({
      method: 'GET',
      url: `${api}/api/user/mfa/backup`,
      json: true,
      headers: {
        Authorization: token,
      },
    });

    locals.codes = response.codes;
    req.session.hasGeneratedBackupCodes = true;
  } catch (err) {
    if (err.message) {
      locals.error = 'Failed to request enrollment information';
    } else {
      locals.error = err;
    }
  }

  return res.render('mfaEnrollBackupCodes');
}
