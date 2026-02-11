
import { verifySync } from 'otplib';
import { getUserById } from '../user.utils.js';
import OtpBackupCodeSchema from '../otpBackupCode.model.js';
import { NotFoundError, ValidationError } from '../../../utils/error.util.js';
import logFactory from '../../../utils/logger.util.js';
const log = logFactory({ name: 'mfaValidate' });
export default async function mfaValidate(body) {
  const {
    userId,
    token,
  } = body;

  let user;

  try {
    user = await getUserById(userId, { lean: false });
  } catch (err) {
    throw err;
  }

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const {
    auth: { totpSecret: secret },
  } = user;

  let isValid;
  try {
    isValid = verifySync({ token, secret }).valid;
  } catch (err) {
    throw err;
  }

  if (!isValid) {
    const backupCode = await OtpBackupCodeSchema.findOne({
      code: token.toLowerCase(),
      userId,
    }).exec();

    if (backupCode) {
      await OtpBackupCodeSchema.deleteOne({ _id: backupCode._id }).exec();
      log.debug('backup code used');
      isValid = true;
    }
  }

  if (!isValid) {
    throw new ValidationError('Invalid token');
  }

  return isValid;
};
