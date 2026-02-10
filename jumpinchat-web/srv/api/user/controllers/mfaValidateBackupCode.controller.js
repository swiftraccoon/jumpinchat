
import OtpBackupCodeSchema from '../otpBackupCode.model.js';
import { ValidationError } from '../../../utils/error.util.js';
export default async function mfaGenBackupCodes(body) {
  const { userId, code } = body;
  const codeDoc = await OtpBackupCodeSchema.findOne({
    userId,
    code,
  }).exec();


  if (codeDoc) {
    await OtpBackupCodeSchema.deleteOne({ _id: codeDoc._id }).exec();
    return true;
  }

  throw new ValidationError('Invalid code');
};
