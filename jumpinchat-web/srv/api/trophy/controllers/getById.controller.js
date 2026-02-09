const Joi = require('joi');
const log = require('../../../utils/logger.util')({ name: 'getTrophy' });
const trophyUtils = require('../trophy.utils');

module.exports = function getTrophyByName(req, res) {
  const schema = Joi.object().keys({
    name: Joi.string(),
  });

  const { error, value: { name } } = schema.validate(req.params, { abortEarly: false });
  if (error) {
    return res.status(400).send();
  }

  return trophyUtils.getTrophyByName(name, (err, trophy) => {
    if (err) {
      if (err === 'ERR_NOT_FOUND') {
        return res.status(404).send();
      }

      log.fatal({ err }, 'error getting trophy');
      return res.status(500).send('ERR_SRV');
    }

    if (!trophy) {
      res.status(404).send();
    }

    return res.status(200).send(trophy);
  });
};
