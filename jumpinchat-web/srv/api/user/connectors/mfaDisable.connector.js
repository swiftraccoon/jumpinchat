
import logFactory from '../../../utils/logger.util.js';
import { NotFoundError } from '../../../utils/error.util.js';
import { getUserById } from '../user.utils.js';
const log = logFactory({ name: 'mfaDisable' });
export default async function mfaDisableConnector(req, res) {
  const {
    user: {
      _id: userId,
    },
  } = req;


  try {
    const user = await getUserById(userId, { lean: false });

    if (!user) {
      const err = new NotFoundError('User not found');
      return res.status(404).send(err.message);
    }

    user.auth.totpSecret = null;
    await user.save();

    return res.status(200).send();
  } catch (err) {
    log.fatal({ err }, 'failed to clear totp secret');
    return res.status(500).send('Server error');
  }
};
