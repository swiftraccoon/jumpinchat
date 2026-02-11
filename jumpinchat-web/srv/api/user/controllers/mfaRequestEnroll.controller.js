
import qrcode from 'qrcode';
import { generateSecret, generateURI } from 'otplib';
import { getUserById } from '../user.utils.js';
import OtpRequestModel from '../otpRequest.model.js';
import { NotFoundError } from '../../../utils/error.util.js';
export default async function mfaRequestEnroll(body) {
  const {
    userId,
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

  let secret;
  const otpRequest = await OtpRequestModel.findOne({ userId }).exec();

  if (otpRequest) {
    ({ secret } = otpRequest);
  } else {
    secret = generateSecret();
  }

  let qrUrl;
  const otpUri = generateURI({ secret, label: user.username, issuer: 'JumpInChat' });

  try {
    qrUrl = await qrcode.toDataURL(otpUri);
  } catch (err) {
    throw err;
  }

  if (!otpRequest) {
    await OtpRequestModel.create({
      secret,
      userId,
    });
  }

  return {
    qrUrl,
  };
};
