
import Joi from 'joi';
import bcrypt from 'bcrypt';
import logFactory from '../../../utils/logger.util.js';
import VerifyModel from '../../verify/verify.model.js';
import userUtils from '../user.utils.js';
const log = logFactory({ name: 'user.resetPasswordVerify' });
const getUser = (userId, cb) => {
  userUtils.getUserById(userId, (err, user) => {
    if (err) {
      log.error('error getting user', err);
      return cb({ status: 401, message: 'Unauthorized' });
    }

    if (!user) {
      log.error('user missing');
      return cb({ status: 401, message: 'Unauthorized' });
    }

    return cb(null, user);
  });
};

const generatePassHash = (password, cb) => bcrypt.genSalt(10, (err, salt) => {
  if (err) {
    log.fatal(err);
    return cb({ status: 403, message: 'Forbidden' });
  }

  return bcrypt.hash(password, salt, (err, hash) => {
    if (err) {
      log.fatal(err);
      return cb({ status: 403, message: 'Forbidden' });
    }

    return cb(null, hash);
  });
});

export default function resetPassword(req, res) {
  const schema = Joi.object().keys({
    password: Joi.string().min(10).required(),
    userId: Joi.string().required(),
  });

  const { error, value: validated } = schema.validate(req.body);
  if (error) {
    log.warn('invalid email verification token');
    res.status(400).send({ error: 'ERR_NO_DATA', message: 'required parameters are missing' });
    return;
  }

  getUser(validated.userId, (err, user) => {
    if (err) {
      return res.status(err.status).send(err.message);
    }

    generatePassHash(validated.password, (err, hash) => {
      if (err) {
        return res.status(err.status).send(err.message);
      }

      user.auth.passhash = hash;
      user.save()
        .then(() => {
          res.status(200).send();
        })
        .catch((saveErr) => {
          log.fatal({ err: saveErr }, 'Failed to save user');
          res.status(403).send('Forbidden');
        });
    });
  });
};
