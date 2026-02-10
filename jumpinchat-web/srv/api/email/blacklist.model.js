
import mongoose from 'mongoose';
const { Schema } = mongoose;

const EmailBlacklistSchema = new Schema({
  address: String,
  domain: String,
  type: String,
  reason: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
});

export default mongoose.model('EmailBlacklist', EmailBlacklistSchema);
