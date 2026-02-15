/**
 * Created by Zaccary on 19/03/2017.
 */

import url from 'url';
import axios from 'axios';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import { errors, api } from '../../constants/constants.js';
import { getRemoteIpFromReq } from '../../utils/userUtils.js';
import config from '../../config/index.js';

const log = logFactory({ name: 'user.create' });

export default async function register(req, res) {
  const { locals } = res;
  const { error } = req.query;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Create an account';
  locals.description = 'Create an account and reserve your chat room. It\'s quick and easy and allows you to start your own customisable room instantly';
  locals.user = req.user;
  locals.error = error || null;

  // Init phase
  if (locals.user && req.signedCookies['jic.ident']) {
    return res.redirect('/');
  }

  log.debug({ errors: locals.error }, 'errors');

  // POST handling
  if (req.method === 'POST' && req.body.action === 'register') {
    const schema = Joi.object({
      username: Joi.string().alphanum().max(32).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(10).required(),
      settings: Joi.object({
        receiveUpdates: Joi.boolean().required(),
      }).required(),
      phone6tY4bPYk: Joi.any().valid('').strip(),
    });

    const user = {
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      settings: {
        receiveUpdates: !!req.body.receiveUpdates,
      },
      phone6tY4bPYk: req.body.phone6tY4bPYk,
    };

    const { error: validationError, value: validatedUser } = schema.validate(user, { abortEarly: false });

    if (validationError) {
      if (validationError.name === 'ValidationError') {
        locals.error = validationError.details.map(e => e.message).join('\n');
      } else {
        locals.error = errors.ERR_SRV;
      }

      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    const username = validatedUser.username.toLowerCase();
    const ip = getRemoteIpFromReq(req);
    const { fingerprint } = req.session;

    log.debug({ username, ip }, 'register user');

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/user/register`,
        data: {
          username,
          password: validatedUser.password,
          email: validatedUser.email,
          settings: validatedUser.settings,
          ip,
          fingerprint,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data.message) {
          log.error({ body: response.data }, 'registration error');
          locals.error = errors[response.data.message] || response.data.message;
        } else {
          locals.error = 'Registration failed';
        }

        return res.redirect(url.format({
          path: './',
          query: {
            error: locals.error,
          },
        }));
      }

      const { user: receivedUser } = response.data.data;

      // Send verification email (fire and forget)
      try {
        const verifyResponse = await axios({
          method: 'POST',
          url: `${api}/api/user/verify/email`,
          data: { user: receivedUser },
          validateStatus: () => true,
        });

        if (verifyResponse.status >= 400) {
          if (verifyResponse.data) {
            log.error({
              response: verifyResponse.status,
              message: verifyResponse.data.message,
            }, 'failed to send email confirmation email');
          } else {
            log.error({
              response: verifyResponse.status,
            }, 'failed to send email confirmation email');
          }
        } else {
          log.debug('verification email sent');
        }
      } catch (verifyErr) {
        log.fatal({ err: verifyErr }, 'verification request failed');
      }

      res.cookie('jic.ident', receivedUser._id, {
        maxAge: config.auth.cookieTimeout,
        signed: true,
        httpOnly: true,
      });

      return res.redirect(`/${user.username}`);
    } catch (err) {
      log.error({ err }, 'error happened');
      return res.status(500).send();
    }
  }

  return res.render('register');
}
