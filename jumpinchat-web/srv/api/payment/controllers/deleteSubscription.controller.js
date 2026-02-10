
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import { cancelSubscription } from '../payment.utils.js';
const log = logFactory({ name: 'deleteSubscription.controller' });
export default async function deleteSubscription(req, res) {
  const { userId } = req.params;

  if (String(req.user._id) !== userId) {
    return res.status(403).send();
  }

  try {
    await cancelSubscription(userId);

    return res.status(204).send();
  } catch (err) {
    log.fatal({ err }, 'error cancelling subscription');
    return res.status(500).send(errors.ERR_SRV);
  }
};
