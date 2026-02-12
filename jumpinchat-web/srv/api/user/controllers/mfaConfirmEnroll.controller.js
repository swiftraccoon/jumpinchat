
import { verifySync } from 'otplib';
import { getUserById } from '../user.utils.js';
import OtpRequestModel from '../otpRequest.model.js';
import { NotFoundError, ValidationError } from '../../../utils/error.util.js';
import logFactory from '../../../utils/logger.util.js';
const log = logFactory({ name: 'mfaConfirmEnroll' });
export default async function mfaConfirmEnroll(body) {
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

  let otpRequest;
  try {
    otpRequest = await OtpRequestModel.findOne({ userId }).exec();
  } catch (err) {
    throw err;
  }

  if (!otpRequest) {
    throw new NotFoundError('TOTP enrollment request not found');
  }

  let isValid;
  try {
    isValid = verifySync({ token, secret: otpRequest.secret, epochTolerance: 30 }).valid;
  } catch (err) {
    throw err;
  }

  log.debug({ isValid }, 'is otp request verify valid');

  if (isValid) {
    try {
      await OtpRequestModel.deleteMany({ userId }).exec();
    } catch (err) {
      throw err;
    }

    user.auth.totpSecret = otpRequest.secret;
    try {
      await user.save();
    } catch (err) {
      throw err;
    }

    return isValid;
  }

  throw new ValidationError('Invalid token');
};
