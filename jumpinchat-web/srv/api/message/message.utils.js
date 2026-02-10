import mongoose from 'mongoose';
import MessageModel from './message.model.js';
import ConversationModel from './conversation.model.js';
import redisFactory from '../../lib/redis.util.js';
import logFactory from '../../utils/logger.util.js';
import errors from '../../config/constants/errors.js';
import config from '../../config/env/index.js';
import email from '../../config/email.config.js';
import { getUserById } from '../user/user.utils.js';
const redis = redisFactory();
const log = logFactory({ name: 'message.utils' });
import { newMessageTemplate } from '../../config/constants/emailTemplates.js';

export function addConversation(participants) {
  const conversation = {
    participants,
    archived: participants.map(participant => ({
      isArchived: false,
      participant,
    })),
  };

  return ConversationModel.create(conversation);
};

export async function getConversations(userId, start, limit) {
  const query = {
    participants: {
      $in: [mongoose.Types.ObjectId(userId)],
    },
    $and: [
      { 'archived.participant': mongoose.Types.ObjectId(userId) },
      { 'archived.isArchived': false },
    ],
  };

  return ConversationModel
    .find(query)
    .sort({ latestMessage: -1 })
    .skip(start)
    .limit(limit)
    .lean(true)
    .populate({
      path: 'participants',
      select: ['username', '_id', 'profile', 'attrs.userLevel'],
    })
    .exec();
};

async function getConversationId(userId, participantId) {
  const message = await MessageModel
    .findOne({
      $or: [
        {
          $and: [
            { recipient: mongoose.Types.ObjectId(userId) },
            { sender: mongoose.Types.ObjectId(participantId) },
          ],
        },
        {
          $and: [
            { recipient: mongoose.Types.ObjectId(participantId) },
            { sender: mongoose.Types.ObjectId(userId) },
          ],
        },
      ],
    })
    .exec();

  if (message) {
    return message.conversationId;
  }

  return null;
}

export { getConversationId };

function getConversation(userId, participantId) {
  const query = {
    participants: {
      $all: [
        mongoose.Types.ObjectId(userId),
        mongoose.Types.ObjectId(participantId),
      ],
    },
  };

  return ConversationModel
    .findOne(query)
    .populate({ path: 'participants', select: ['username', '_id'] })
    .exec();
}

export { getConversation };

async function getSingleConversation(userId, participantId, page) {
  const limit = config.messages.pageSize * page;
  let conversation;

  try {
    conversation = await getConversation(userId, participantId);
  } catch (err) {
    log.fatal({ err }, 'failed to get conversation');
    throw err;
  }

  if (!conversation) {
    return null;
  }

  return MessageModel
    .find({
      $and: [
        { conversation: conversation._id },
        {
          $or: [
            {
              $and: [
                { recipient: mongoose.Types.ObjectId(userId) },
                { 'attrs.archived.recipient': false },
              ],
            },
            {
              $and: [
                { sender: mongoose.Types.ObjectId(userId) },
                { 'attrs.archived.sender': false },
              ],
            },
          ],
        },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
}
export { getSingleConversation };

export function getAllUnread(userId) {
  return MessageModel.countDocuments({
    recipient: userId,
    'attrs.unread': true,
  }).exec();
};

async function getConversationMessages(userId, participantId) {
  let conversation;
  try {
    conversation = await getConversation(userId, participantId);
  } catch (err) {
    throw err;
  }

  if (!conversation) {
    return [];
  }

  return MessageModel
    .find({ conversation: mongoose.Types.ObjectId(conversation._id) })
    .exec();
}

export { getConversationMessages };

export async function getConversationUnread(userId, participantId) {
  const query = {
    recipient: userId,
    sender: participantId,
  };
  const total = await MessageModel.countDocuments({
    $or: [
      {
        $and: [
          { recipient: mongoose.Types.ObjectId(userId) },
          { sender: mongoose.Types.ObjectId(participantId) },
          { 'attrs.archived.recipient': false },
        ],
      },
      {
        $and: [
          { recipient: mongoose.Types.ObjectId(participantId) },
          { sender: mongoose.Types.ObjectId(userId) },
          { 'attrs.archived.sender': false },
        ],
      },
    ],
  }).exec();
  const unread = await MessageModel.countDocuments({
    ...query,
    'attrs.unread': true,
  }).exec();

  return Promise.all([total, unread]);
};

export async function getConversationCount(userId) {
  return ConversationModel.countDocuments({ participants: { $in: [userId] } }).exec();
};

async function setInCache(key, data) {
  let dataString;
  try {
    dataString = JSON.stringify(data);
  } catch (err) {
    log.fatal({ err }, 'error stringifying conversations');
    throw err;
  }

  try {
    await redis.set(key, dataString);
    await redis.expire(key, config.messages.cacheTimeout);
  } catch (err) {
    log.fatal({ err }, 'error setting conversations in cache');
    throw err;
  }
}

async function getFromCache(key) {
  let data;
  try {
    data = await redis.get(key);
  } catch (err) {
    log.fatal({ err }, 'error getting conversations from cache');
    throw err;
  }

  if (!data) {
    return undefined;
  }

  try {
    return JSON.parse(data);
  } catch (err) {
    log.fatal({ err }, 'failed to parse data');
    throw err;
  }
}

export function setConversationsInCache(userId, conversations, page) {
  const key = `messages:${String(userId)}:${page}`;
  return setInCache(key, conversations);
};

export function setConversationInCache(userId, recipientId, conversation, page) {
  const key = `messages:${String(userId)}:${String(recipientId)}:${page}`;
  return setInCache(key, conversation);
};

export function getConversationsFromCache(userId, page) {
  const key = `messages:${String(userId)}:${page}`;
  return getFromCache(key);
};

export function getConversationFromCache(userId, recipientId, page) {
  const key = `messages:${String(userId)}:${String(recipientId)}:${page}`;
  return getFromCache(key);
};


async function addMessage(conversationId, senderId, recipientId, message) {
  if (senderId === recipientId) {
    return false;
  }

  let sender;
  let recipient;

  try {
    const userPromises = [
      getUserById(senderId, { lean: false }),
      getUserById(recipientId, { lean: false }),
    ];

    ([sender, recipient] = await Promise.all(userPromises));
  } catch (err) {
    log.fatal({ err }, 'failed to get user objects');
    throw err;
  }

  const senderIgnored = recipient.settings.ignoreList.some(u => String(u.userId) === senderId);

  if (senderIgnored && sender.attrs.userLevel < 30) {
    const error = new Error('You can not send messages to this user');
    error.name = 'PermissionDeniedError';
    throw error;
  }

  let createdMessage;

  try {
    createdMessage = await MessageModel.create({
      conversation: conversationId,
      sender: sender._id,
      recipient: recipient._id,
      message,
    });
  } catch (err) {
    throw err;
  }

  if (recipient.auth.email_is_verified && recipient.settings.receiveMessageNotifications) {
    email.sendMail({
      to: recipient.auth.email,
      subject: 'You have a new message',
      html: newMessageTemplate({
        user: recipient,
        sender,
      }),
    }, (err, info) => {
      if (err) {
        log.fatal({ err }, 'failed to send verification email');
        return;
      }

      log.debug({ info }, 'message notification email sent');
    });
  }

  return createdMessage;
}

export { addMessage };

export function getMessageById(id) {
  return MessageModel
    .findOne({ _id: id })
    .populate({
      path: 'sender',
      select: ['username', '_id'],
    })
    .populate({
      path: 'recipient',
      select: ['username', '_id'],
    })
    .exec();
};

export function setMessagesRead(userId) {
  return MessageModel
    .updateMany({ recipient: userId }, { $set: { 'attrs.unread': false } })
    .exec();
};

export default { addConversation, getConversations, getConversationId, getConversation, getSingleConversation, getAllUnread, getConversationMessages, getConversationUnread, getConversationCount, setConversationsInCache, setConversationInCache, getConversationsFromCache, getConversationFromCache, addMessage, getMessageById, setMessagesRead };
