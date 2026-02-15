import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const banlistSchema = new Schema({
  ip: String,
  userId: { Type: Schema.Types.ObjectId },
  sessionId: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date,
  reason: String,
  restrictions: {
    broadcast: { type: Boolean, default: true },
    join: { type: Boolean, default: true },
  },
});

export default model('Banlist', banlistSchema);
