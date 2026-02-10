/**
 * Created by Zaccary on 24/10/2015.
 */



import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import logFactory from '../../../utils/logger.util.js';
import userUtils from '../user.utils.js';
import config from '../../../config/env/index.js';
import ReturnModel from '../../../lib/return-model/index.js';
import { getRemoteIpFromReq } from '../../../utils/utils.js';
const log = logFactory({ name: 'user.login' });
export default function login(req, res) {
  const schema = Joi.object().keys({
    username: Joi.string().required(),
    password: Joi.string().required(),
  });

  const { error, value: validatedLogin } = schema.validate({
    username: req.body.username,
    password: req.body.password,
  }, { abortEarly: false });
  if (error) {
    log.warn('invalid login details');
    return res.status(400).send(new ReturnModel(error, null, 'ERR_VALIDATION'));
  }

  userUtils.getUserByName(validatedLogin.username.toLowerCase(), (err, user) => {
      if (err) {
        log.fatal({ err }, 'error getting user by username');
        return res.status(500).send(new ReturnModel(null, null, 'ERR_SRV'));
      }

      if (!user) {
        log.warn('username not found during login');
        return res.status(401).send(new ReturnModel(null, null, 'ERR_NO_USER'));
      }

      bcrypt.compare(validatedLogin.password, user.auth.passhash, (err, doesMatch) => {
        if (err) {
          log.fatal({ err }, 'error comparing passhash');
          return res.status(401).send('forbidden');
        }

        if (!doesMatch) {
          log.warn('user entered an incorrect password');
          return res.status(401).send(new ReturnModel(null, null, 'ERR_BAD_PASS'));
        }

        user.attrs.last_login_ip = getRemoteIpFromReq(req);
        user.attrs.last_active = new Date();

        // log user in
        const token = jwt.sign(String(user._id), config.auth.jwt_secret);
        user.save()
          .then((savedUser) => {
            const dataToReturn = {
              user: savedUser,
              token,
            };

            // create cookie/cookies
            res.cookie('jic.ident', savedUser._id, {
              maxAge: config.auth.cookieTimeout,
              signed: true,
              httpOnly: true,
              secure: config.auth.secureSessionCookie,
              sameSite: 'lax',
            });

            res.status(200).send(new ReturnModel(null, dataToReturn, null));
          })
          .catch((saveErr) => {
            log.fatal({ err: saveErr }, 'error saving user');
            res.status(403).send('forbidden');
          });
      });
    });
};
