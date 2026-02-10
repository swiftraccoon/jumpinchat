
import Joi from 'joi';
import logFactory from '../../../utils/logger.util.js';
import userUtils from '../user.utils.js';
const log = logFactory({ name: 'setPlay.controller' });
export default async function setTheme(req, res) {
  const querySchema = Joi.object().keys({
    dark: Joi.boolean().required(),
  });

  const paramsSchema = Joi.object().keys({
    userId: Joi.string().required(),
  });

  try {
    const { error: queryError, value: { dark } } = querySchema.validate(req.query);
    if (queryError) throw queryError;
    const { error: paramsError, value: { userId } } = paramsSchema.validate(req.params);
    if (paramsError) throw paramsError;

    log.debug({ userId: req.params });
    return userUtils.getUserById(userId, (err, user) => {
      if (err) {
        log.fatal({ err });
        return res.status(500).send();
      }

      if (!user) {
        log.error({ userId }, 'user not found');
        return res.status(404).send({
          error: 'ERR_NO_USER',
          message: 'user not found',
        });
      }

      user.settings.darkTheme = dark;

      user.save()
        .then(() => res.status(200).send({ darkTheme: dark }))
        .catch((saveErr) => {
          log.fatal({ err: saveErr });
          res.status(500).send();
        });
    });
  } catch (err) {
    log.fatal({ err });
    return res.status(500).send();
  }
};
