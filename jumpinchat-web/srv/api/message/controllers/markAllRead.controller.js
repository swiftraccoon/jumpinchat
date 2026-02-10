
import messageUtils from '../message.utils.js';
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'markAllRead' });
export default async function markAllRead(req, res) {
  const userId = req.user._id;

  try {
    const result = await messageUtils.setMessagesRead(userId);
    log.debug({ result }, 'messages marked read');
    return res.status(200).send();
  } catch (err) {
    log.fatal({ err }, 'failed to set messages read');
    return res.status(500).end();
  }
};
