
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import adminUtils from '../admin.utils.js';
const log = logFactory({ name: 'admin.getSiteMods' });
export default async function getSiteMods(req, res) {
  try {
    const siteMods = await adminUtils.getSiteMods();

    return res.status(200).send(siteMods);
  } catch (err) {
    log.fatal({ err }, 'failed to get site mods');
    return res.status(500).send(errors.ERR_SRV);
  }
};
