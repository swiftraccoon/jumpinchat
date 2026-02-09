const log = require('../../../utils/logger.util')({ name: 'setPlay.controller' });
const Joi = require('joi');
const { getUserById } = require('../../user/user.utils');

module.exports = function (req, res) {
  const userId = req.signedCookies['jic.ident'];

  if (!userId) {
    return res.status(200).send();
  }

  const schema = Joi.object().keys({
    play: Joi.boolean().required(),
  });

  const { error } = schema.validate(req.query);
  if (error) {
    return res.status(400).send({
      error: 'ERR_VALIDATION',
      message: 'required query `play` must be a boolean value',
    });
  }

  return getUserById(userId, { lean: false }, (err, user) => {
    if (err) {
      log.fatal({ err }, 'error getting user');
      return res.status(500).send({ error: 'an error occurred' });
    }

    if (!user) {
      log.error({ userId }, 'User could not be found');
      return res.status(401).send({ error: 'User could not be found' });
    }

    user.settings.playYtVideos = req.query.play;

    return user.save()
      .then((savedUser) => res.status(200).send({ playVideos: savedUser.settings.playYtVideos }))
      .catch((saveErr) => {
        log.fatal({ err: saveErr }, 'error saving user');
        res.status(500).send({ error: 'an error occurred' });
      });
  });
};
