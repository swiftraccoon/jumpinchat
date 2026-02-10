
import logFactory from '../../../utils/logger.util.js';
import { NotFoundError, ValidationError } from '../../../utils/error.util.js';
import mfaConfirmEnroll from '../controllers/mfaConfirmEnroll.controller.js';
const log = logFactory({ name: 'mfaConfirmEnroll' });
export default async function mfaConfirmEnrollConnector(req, res) {
  const {
    user,
  } = req;

  const { token } = req.body;

  if (!token) {
    return res.status(400).send('Token is required');
  }

  try {
    const response = await mfaConfirmEnroll({ userId: user._id, token });
    return res.status(200).send(response);
  } catch (err) {
    log.error({ err }, 'failed to confirm mfa enrollment');
    if (err instanceof NotFoundError) {
      return res.status(404).send(err.message);
    }

    if (err instanceof ValidationError) {
      return res.status(403).send(err.message);
    }

    return res.status(500).send();
  }
};
