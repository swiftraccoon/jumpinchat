import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const roomCloseSchema = new Schema({
  name: String,
  reason: String,
  createdAt: Date,
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

export default model('RoomClose', roomCloseSchema);
