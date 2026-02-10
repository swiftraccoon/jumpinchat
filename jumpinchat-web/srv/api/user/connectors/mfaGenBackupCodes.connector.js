
import logFactory from '../../../utils/logger.util.js';
import mfaGenBackupCodes from '../controllers/mfaGenBackupCodes.controller.js';
const log = logFactory({ name: 'mfaGenBackupCodes' });
export default async function mfaGenBackupCodesConnector(req, res) {
  const {
    user,
  } = req;

  try {
    const response = await mfaGenBackupCodes({ userId: user._id });
    return res.status(200).send(response);
  } catch (err) {
    log.fatal({ err }, 'failed to generate backup codes');
    return res.status(500).send();
  }
};
