
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import adminUtils from '../admin.utils.js';
import userUtils from '../../user/user.utils.js';
import trophyUtils from '../../trophy/trophy.utils.js';
const log = logFactory({ name: 'admin.removeSiteMod' });
export default async function removeSiteMod(req, res) {
  const { modId } = req.params;

  let mod;

  try {
    mod = await adminUtils.getSiteModById(modId);
  } catch (err) {
    log.fatal({ err }, 'failed to fetch site mod');
    return res.status(500).send(errors.ERR_SRV);
  }

  try {
    await trophyUtils.removeTrophy(mod.user, 'TROPHY_SITE_MOD');
  } catch (err) {
    log.fatal({ err }, 'failed to remove site mod trophy');
    return res.status(500).send(errors.ERR_SRV);
  }

  try {
    await adminUtils.removeSiteMod(modId);
  } catch (err) {
    log.fatal({ err }, 'failed to remove site mod');
    return res.status(500).send(errors.ERR_SRV);
  }

  return res.status(204).send();
};
