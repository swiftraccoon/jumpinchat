
import mongoose from 'mongoose';
import config from '../../config/env/index.js';
const { Schema } = mongoose;

const OtpRequestSchema = new Schema({
  secret: String,
  createdAt: { type: Date, expires: config.verification.emailTimeout, default: Date.now },
  userId: Schema.Types.ObjectId,
});

export default mongoose.model('OtpRequest', OtpRequestSchema);
