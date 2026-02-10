
import Joi from 'joi';
import bcrypt from 'bcrypt';
import logFactory from '../../../utils/logger.util.js';
import userUtils from '../user.utils.js';
import { createEmailVerification } from '../../verify/verify.utils.js';
const log = logFactory({ name: 'user.changeEmail' });
export default function changeEmail(req, res) {
  const schema = Joi.object().keys({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });

  const { error, value: validated } = schema.validate(req.body);
  if (error) {
    log.warn({ err: error }, 'body invalid');
    return res.status(400).send({ error: 'ERR_INVALID_BODY', message: 'Invalid body' });
  }

  return userUtils.getUserById(req.params.userId, (err, user) => {
      if (err) {
        log.fatal({ err }, 'error getting user');
        return res.status(403).send({ error: 'ERR_SRV', message: 'Server error' });
      }

      if (!user) {
        log.warn('Could not find user');
        res
          .status(404)
          .send({ error: 'ERR_NO_USER', message: 'Could not find user' });
        return;
      }

      if (user.auth.email === validated.email) {
        return res.status(200).send();
      }


      return bcrypt.compare(validated.password, user.auth.passhash, (err, doesMatch) => {
        if (err) {
          log.fatal({ err }, 'error comparing passhash');
          return res.status(401).send('forbidden');
        }

        if (!doesMatch) {
          log.warn('user entered an incorrect password');
          return res.status(401).send({
            error: 'ERR_BAD_PASS',
            message: 'password invalid',
          });
        }

        user.auth.email = validated.email;
        user.auth.email_is_verified = false;

        return user.save()
          .then(() => {
            createEmailVerification(user, (verifyErr) => {
              if (verifyErr) {
                log.fatal({ err: verifyErr }, 'failed to send verification email');
              }

              return res.status(200).send();
            });
          })
          .catch((saveErr) => {
            log.fatal({ err: saveErr }, 'error saving user');
            res.status(500).send({ error: 'ERR_SRV', message: 'Server error' });
          });
      });
    });
};
