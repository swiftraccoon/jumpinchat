import Joi from 'joi';
import logFactory from '../utils/logger.js';
import { getUserByUsername } from '../utils/userUtils.js';

const log = logFactory({ name: 'removeIgnore' });

export default async function removeIgnore(req, res) {
  const schema = Joi.object({
    id: Joi.string(),
    username: Joi.string(),
  });

  const { error, value: validated } = schema.validate({
    username: req.body.username,
    id: req.body.id,
  });

  if (error) {
    log.warn(error);
    return res.status(400).send();
  }

  try {
    const user = await getUserByUsername(validated.username);
    if (!user) {
      log.error({ username: validated.username }, 'user not found');
      return res.status(404).send();
    }

    user.settings.ignoreList = user.settings.ignoreList
      .filter(i => String(i._id) !== validated.id);

    try {
      await user.save();
      return res.status(204).send();
    } catch (err) {
      log.fatal({ err }, 'error saving user');
      return res.status(500).send();
    }
  } catch (err) {
    log.fatal({ err }, 'error getting user');
    return res.status(500).send();
  }
}
