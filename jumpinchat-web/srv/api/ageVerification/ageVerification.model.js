
import mongoose from 'mongoose';
import { statuses } from './ageVerification.const.js';
const { Schema } = mongoose;

const AgeVerificationSchema = new Schema({
  user: Schema.Types.ObjectId,
  images: [String],
  status: { type: String, default: statuses.PENDING },
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date,
  updatedAt: Date,
});

export default mongoose.model('AgeVerification', AgeVerificationSchema);
