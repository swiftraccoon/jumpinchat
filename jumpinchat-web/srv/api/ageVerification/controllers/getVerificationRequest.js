
import logFactory from '../../../utils/logger.util.js';
import { findById } from '../ageVerification.utils.js';
const log = logFactory({ name: 'getVerificationRequests' });
export default async function getVerificationRequest(req, res) {
  const { id } = req.params;
  try {
    const request = await findById(id);
    res.status(200).send(request);
  } catch (err) {
    log.fatal({ err, id }, 'error fetching request');
    res.status(500).send();
  }
};
