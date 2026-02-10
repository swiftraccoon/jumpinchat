
import logFactory from '../../../utils/logger.util.js';
import { getRequests } from '../ageVerification.utils.js';
const log = logFactory({ name: 'getVerificationRequests' });
export default async function getVerificationRequests(req, res) {
  try {
    const requests = await getRequests();
    return res.status(200).send(requests);
  } catch (err) {
    log.fatal({ err }, 'error fetching requests');
    return res.status(500).send();
  }
};
