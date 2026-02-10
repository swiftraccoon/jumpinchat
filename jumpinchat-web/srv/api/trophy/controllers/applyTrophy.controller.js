
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import { applyTrophy } from '../trophy.utils.js';
const log = logFactory({ name: 'applyTrophy.controllers' });
export default function applyTrophyController(req, res) {
  const { userId } = req.params;
  const { trophyName } = req.body;

  return applyTrophy(userId, trophyName, (err) => {
    if (err) {
      log.fatal({ err }, 'failed to apply trophy');
      return res.status(500).send(errors.ERR_SRV);
    }

    log.info({ userId }, 'trophy applied');
    return res.status(200).send();
  });
};
