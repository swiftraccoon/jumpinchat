
import Joi from 'joi';
import logFactory from '../../../utils/logger.util.js';
import messageUtils from '../message.utils.js';
import sitebanUtils from '../../siteban/siteban.utils.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'addMessage' });
export default async function addMessage(req, res) {
  const { recipient } = req.params;
  const sender = String(req.user._id);
  const schema = Joi.object().keys({
    message: Joi.string(),
  });

  try {
    const siteban = await sitebanUtils.getBanlistItem({ userId: sender });

    if (siteban) {
      return res.status(403).send(errors.ERR_USER_BANNED);
    }
  } catch (err) {
    log.fatal({ err }, 'failed to get banlist item');
    return res.status(500).send(errors.ERR_SRV);
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

    let conversation;

    try {
      conversation = await messageUtils.getConversation(sender, recipient);
    } catch (err) {
      log.fatal({ err }, 'failed to fetch conversation');
      return res.status(500).send(errors.ERR_SRV);
    }

    if (!conversation) {
      log.debug('conversation does not exist, creating');
      try {
        conversation = await messageUtils.addConversation([sender, recipient]);
      } catch (err) {
        log.fatal({ err }, 'failed to create conversation');
        return res.status(500).send(errors.ERR_SRV);
      }
    }

    try {
      const { _id: conversationId } = conversation;
      const newMessage = await messageUtils.addMessage(conversationId, sender, recipient, message);

      conversation.latestMessage = new Date();
      conversation.archived = conversation.archived.map(archived => ({
        participant: archived.participant,
        isArchived: false,
      }));
      await conversation.save();

      return res.status(201).send(newMessage);
    } catch (err) {
      if (err.name === 'PermissionDeniedError') {
        return res.status(500).send({
          message: err.message,
        });
      }

      log.fatal({ err }, 'failed to add new message');
      return res.status(500).send(errors.ERR_SRV);
    }
  } catch (err) {
    log.error({ err }, 'validation error');
    return res.status(500).send(errors.ERR_VALIDATION);
  }
};
