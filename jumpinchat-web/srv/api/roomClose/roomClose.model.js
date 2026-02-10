
import mongoose from 'mongoose';
import config from '../../config/env/index.js';
const { Schema } = mongoose;

const RoomCloseSchema = new Schema({
  name: String,
  reason: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: Date,
  users: [
    {
      ip: String,
      sessionId: String,
      userId: { type: Schema.Types.ObjectId },
      handle: String,
    },
  ],
});

export default mongoose.model('RoomClose', RoomCloseSchema);
