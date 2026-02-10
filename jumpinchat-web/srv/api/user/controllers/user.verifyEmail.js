
import logFactory from '../../../utils/logger.util.js';
import Joi from 'joi';
import VerifyModel from '../../verify/verify.model.js';
import trophyUtils from '../../trophy/trophy.utils.js';
import UserUtils from '../user.utils.js';
import { types as verifyTypes } from '../../verify/verify.constants.js';
const log = logFactory({ name: 'user.verifyEmail' });
export default function verifyEmail(req, res) {
  const schema = Joi.object().keys({
    token: Joi.string().required(),
  });

  const { error, value: validated } = schema.validate(req.params);
  if (error) {
    log.warn('invalid email verification token');
    res.status(400).send({ error: 'ERR_TOKEN_INVALID', message: 'A valid token is required' });
    return;
  }


  VerifyModel
    .findOne({ token: validated.token, type: verifyTypes.TYPE_EMAIL })
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

      UserUtils.getUserById(v.userId, (err, user) => {
        if (err) {
          log.fatal('could not get user', v.userId, err);
          res.status(403).send();
          return;
        }

        if (!user) {
          log.error('user does not exists', v.userId);
          res.status(401).send();
          return;
        }

        user.auth.email_is_verified = true;
        user.save()
          .then(() => {
            trophyUtils.applyTrophy(user._id, 'TROPHY_EMAIL_VERIFIED', (trophyErr) => {
              if (trophyErr) {
                log.error({ err: trophyErr }, 'failed to apply trophy');
              }

              log.debug('applied trophy');
            });

            res.status(200).send();
          })
          .catch((saveErr) => {
            log.fatal('error saving user', user._id, saveErr);
            res.status(403).send();
          });
      });
    })
    .catch((err) => {
      log.fatal(err);
      res.status(403).send();
    });
};
