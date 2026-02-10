import logFactory from '../../../utils/logger.util.js';
const log = logFactory({ name: 'admin.openNotification' });
import { isSubscriptionConfirmation, handleSnsSubscription } from '../../email/email.utils.js';


export default function openNotification(req, res) {
  if (isSubscriptionConfirmation(req.headers)) {
    return handleSnsSubscription(req, res);
  }

  try {
    const message = JSON.parse(req.body.Message);
    const { eventType } = message;

    log.info({ openNotification: message }, `email ${eventType}`);
    return res.status(204).send();
  } catch (err) {
    log.fatal({ err }, 'error parsing email open notification');
    return res.status(500).send(err);
  }
};
