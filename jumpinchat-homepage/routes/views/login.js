/**
 * Created by Zaccary on 19/03/2017.
 */

import axios from 'axios';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import { errors, api } from '../../constants/constants.js';
import config from '../../config/index.js';

const log = logFactory({ name: 'login view' });

export default async function login(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Log into your account';
  locals.description = 'Already have an account? Log in using your username';
  locals.user = req.user;
  locals.errors = null;

  // Init phase
  if (locals.user) {
    return res.redirect('/');
  }

  // POST handling
  if (req.method === 'POST' && req.body.action === 'login') {
    const schema = Joi.object({
      username: Joi.string().required(),
      password: Joi.string().required(),
    });

    const { error, value: validatedLogin } = schema.validate({
      username: req.body.username,
      password: req.body.password,
    }, { abortEarly: false });

    if (error) {
      log.warn('invalid login details');
      locals.errors = errors.ERR_VALIDATION;
      return res.render('login');
    }

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/user/login`,
        data: {
          username: validatedLogin.username.toLowerCase(),
          password: validatedLogin.password,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data.message) {
          locals.errors = errors[response.data.message];
        } else {
          locals.errors = 'Login failed';
        }
        return res.render('login');
      }

      const { user } = response.data.data;

      if (user.auth.totpSecret) {
        req.session.user = String(user._id);
        return res.redirect('/login/totp');
      }

      res.cookie('jic.ident', user._id, {
        maxAge: config.auth.cookieTimeout,
        signed: true,
        httpOnly: true,
      });

      return res.redirect('/');
    } catch (err) {
      log.error({ err }, 'error happened');
      return res.status(500).send();
    }
  }

  return res.render('login');
}
