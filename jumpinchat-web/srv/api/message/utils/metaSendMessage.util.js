
import logFactory from '../../../utils/logger.util.js';
import messageUtils from '../message.utils.js';
import userUtils from '../../user/user.utils.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'metaSendMessage.util' });
export default async function metaSendMessage(userId, message) {
  let sender;

  if (!userId) {
    throw new Error('User ID missing');
  }

  if (!message || message.length === 0) {
    throw new Error('Message is required');
  }

  try {
    sender = await userUtils.getUserByName('jumpinchat', { lean: true });
  } catch (err) {
    log.fatal({ err }, 'failed to get meta user');
    throw err;
  }

  if (!sender) {
    log.fatal('meta user not found');
    throw errors.ERR_NO_USER;
  }


  let conversation;

  try {
    conversation = await messageUtils.getConversation(sender._id, userId);
  } catch (err) {
    log.fatal({ err }, 'failed to fetch conversation');
    throw err;
  }

  if (!conversation) {
    log.debug('conversation does not exist, creating');
    try {
      conversation = await messageUtils.addConversation([sender._id, userId]);
    } catch (err) {
      log.fatal({ err }, 'failed to create conversation');
      throw err;
    }
  }


  try {
    const user = await userUtils.getUserById(userId, { lean: true });

    const newMessage = await messageUtils.addMessage(
      conversation._id,
      sender._id,
      user._id,
      message,
    );

    try {
      conversation.latestMessage = new Date();
      conversation.archived = conversation.archived.map(archived => ({
        participant: archived.participant,
        isArchived: false,
      }));
      await conversation.save();
    } catch (err) {
      log.fatal({ err }, 'failed to update conversation');
    }

    return newMessage;
  } catch (err) {
    log.error({ err }, 'validation error');
    throw errors.ERR_VALIDATION;
  }
};
