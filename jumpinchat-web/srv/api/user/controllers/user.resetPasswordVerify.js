
import logFactory from '../../../utils/logger.util.js';
import Joi from 'joi';
import VerifyModel from '../../verify/verify.model.js';
import { types as verifyTypes } from '../../verify/verify.constants.js';
const log = logFactory({ name: 'user.resetPasswordVerify' });
export default function resetPasswordVerify(req, res) {
  const schema = Joi.object().keys({
    token: Joi.string().required(),
  });

  const { error, value: validated } = schema.validate(req.params);
  if (error) {
    log.warn('invalid email verification token');
    res.status(400).send({ error: 'ERR_TOKEN_INVALID', message: 'A valid token is required' });
    return;
  }

  log.debug({ token: validated.token }, 'verifying reset token');


  VerifyModel
    .findOne({ token: validated.token, type: verifyTypes.TYPE_PASS_RESET })
    .where({ expireDate: { $gt: new Date() } })
    .exec()
    .then((v) => {
      if (!v) {
        log.warn('verification token not found');
        res.status(403).send({
          error: 'ERR_NO_TOKEN',
          message: 'Token is invalid or has expired',
        });
        return;
      }

      res.status(200).send({ userId: v.userId });
    })
    .catch((err) => {
      log.fatal(err);
      res.status(403).send();
    });
};
