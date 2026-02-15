import url from 'url';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import { api } from '../../constants/constants.js';
import request from '../../utils/request.js';
import logFactory from '../../utils/logger.js';

const log = logFactory({ name: 'login.mfa' });

export default async function mfaVerify(req, res) {
  const { locals } = res;
  const { user } = req.session;

  locals.section = 'Validate login';
  locals.description = 'Validate login';
  locals.error = req.query.error || null;

  // Init phase
  log.debug({
    user: locals.user ? locals.user.username : null,
    session: req.session,
  });
  if (!user) {
    return res.redirect('/login');
  }

  const token = jwt.sign(String(user), config.auth.jwtSecret);

  // POST handling
  if (req.method === 'POST' && req.body.action === 'verify') {
    const schema = Joi.object({
      token: Joi.string().min(6).max(6).required(),
    });

    const { error } = schema.validate({ token: req.body.token });

    if (error) {
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
        url: `${api}/api/user/mfa/verify`,
        json: true,
        body: {
          token: req.body.token,
        },
        headers: {
          Authorization: token,
        },
      });
    } catch (err) {
      if (err.message) {
        locals.error = 'Verification failed';
      } else {
        locals.error = err;
      }

      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    res.cookie('jic.ident', user, {
      maxAge: config.auth.cookieTimeout,
      signed: true,
      httpOnly: true,
    });

    return res.redirect('/');
  }

  return res.render('mfaVerify');
}
