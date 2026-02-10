
import Joi from 'joi';
import messageUtils from '../message.utils.js';
import logFactory from '../../../utils/logger.util.js';
import Queue from '../../../utils/queue.util.js';
import userUtils from '../../user/user.utils.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'adminMessageAll' });
export default async function adminMessageAll(req, res) {
  let sender;
  const schema = Joi.object().keys({
    message: Joi.string(),
  });

  try {
    sender = await userUtils.getUserByName('jumpinchat');
  } catch (err) {
    log.fatal({ err }, 'failed to get meta user');
    return res.status(500).send(err);
  }

  if (!sender) {
    log.fatal('meta user not found');
    return res.status(500).send(errors.ERR_NO_USER);
  }

  try {
    const {
      error,
      value: {
        message,
      },
    } = schema.validate(req.body);

    if (error) {
      return res.status(400).send(error);
    }


    return userUtils.getAllUsersNoPaginate((err, users) => {
      if (err) {
        log.fatal({ err }, 'Error getting all users');
        return res.status(500).end();
      }

      const queue = new Queue(messageUtils.addMessage, 100);

      queue.on('done', () => {
        log.info('message send queue complete');
      });

      queue.on('error', (err) => {
        log.error({ err }, 'message send failed');
      });

      users.forEach((recipient) => {
        const args = [sender._id, String(recipient._id), message];
        queue.addToQueue(args);
      });

      return res.status(200).send();
    });
  } catch (err) {
    log.error({ err }, 'validation error');
    return res.status(500).send(errors.ERR_VALIDATION);
  }
};
