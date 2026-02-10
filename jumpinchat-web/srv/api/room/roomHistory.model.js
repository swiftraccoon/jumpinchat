
import mongoose from 'mongoose';
import config from '../../config/env/index.js';
const { Schema } = mongoose;

const RoomHistorySchema = new Schema({
  room: Schema.Types.ObjectId,
  roomName: String,
  user: {
    userListId: Schema.Types.ObjectId,
    sessionId: String,
    ip: String,
    user_id: { type: Schema.Types.ObjectId, default: null },
    handle: String,
    username: { type: String, default: null },
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: config.room.historyTimeout,
  },
});

export default mongoose.model('RoomHistory', RoomHistorySchema);
