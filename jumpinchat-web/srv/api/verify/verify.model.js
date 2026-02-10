
import mongoose from 'mongoose';
import config from '../../config/env/index.js';
const { Schema } = mongoose;

const VerifySchema = new Schema({
  token: String,
  createdAt: { type: Date, expires: config.verification.emailTimeout, default: Date.now },
  expireDate: Date,
  userId: Schema.Types.ObjectId,
  type: String,
});

export default mongoose.model('Verify', VerifySchema);
