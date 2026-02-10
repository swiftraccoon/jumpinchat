
import mongoose from 'mongoose';
import config from '../../config/env/index.js';
const { Schema } = mongoose;
const MessageReportSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  reason: String,
  message: { type: Schema.Types.ObjectId, ref: 'Message' },
});

export default mongoose.model('MessageReport', MessageReportSchema);
