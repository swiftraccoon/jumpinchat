
import mongoose from 'mongoose';
const { Schema } = mongoose;

const OtpBackupCodeSchema = new Schema({
  code: String,
  createdAt: { type: Date, default: Date.now },
  userId: Schema.Types.ObjectId,
});

export default mongoose.model('OtpBackupCode', OtpBackupCodeSchema);
