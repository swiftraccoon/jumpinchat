
import messageUtils from '../message.utils.js';
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'getUnread' });
export default async function getUnread(req, res) {
  const { userId } = req.params;

  try {
    const unread = await messageUtils.getAllUnread(userId);
    return res.status(200).send({ unread });
  } catch (err) {
    log.fatal({ err }, 'failed to get unread messages');
    return res.status(500).end();
  }
};
