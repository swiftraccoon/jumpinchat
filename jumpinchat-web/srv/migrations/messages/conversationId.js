import logFactory from '../../utils/logger.util.js';
import MessageModel from '../../api/message/message.model.js';
const log = logFactory({ name: 'migrations.conversationId' });
import { addConversation, getConversation } from '../../api/message/message.utils.js';

export default async function conversationIdMigration() {
  log.info('initiate message migrations');
  const cursor = MessageModel.find({}).cursor();
  const handleMessage = async (message) => {
    if (!message) {
      log.debug('no message');
      return Promise.resolve({});
    }

    let conversation;

    try {
      conversation = await getConversation(message.sender, message.recipient);
    } catch (err) {
      log.fatal({ err }, 'failed to fetch conversation');
      throw err;
    }

    if (!conversation) {
      try {
        conversation = await addConversation(message.sender, message.recipient);
      } catch (err) {
        log.error({ err }, 'failed to create conversation');
        throw err;
      }
    }

    if (!conversation.participants || conversation.participants.length <= 1) {
      conversation.participants = [
        message.sender,
        message.recipient,
      ];
    }

    const messageTime = new Date(message.createdAt).getTime();
    const conversationLatest = conversation.latestMessage
      ? new Date(conversation.latestMessage).getTime()
      : null;

    if (!conversationLatest || conversation.latestMessage < messageTime) {
      conversation.latestMessage = messageTime;
    }

    if (!conversation.archived || conversation.archived.length === 0) {
      conversation.archived = conversation.participants.map(({ _id: participant }) => {
        const senderArchived = String(message.sender) === String(participant)
          && message.attrs.archived.sender;
        const recipientArchived = String(message.recipient) === String(participant)
          && message.attrs.archived.recipient;

        return {
          participant,
          isArchived: senderArchived || recipientArchived,
        };
      });
    }

    try {
      await conversation.save();
    } catch (err) {
      throw err;
    }

    return MessageModel.updateOne(
      { _id: message._id },
      { $set: { conversation: conversation._id } },
      { w: 1 },
    );
  };

  for await (const doc of cursor) {
    await handleMessage(doc);
  }

  log.info('migration complete');
};
