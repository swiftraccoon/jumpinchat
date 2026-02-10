
import mongoose from 'mongoose';
const { Schema } = mongoose;

const RoomEmojiSchema = new Schema({
  image: String,
  createdAt: { type: Date, default: Date.now },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  alias: String,
  room: Schema.Types.ObjectId,
});

export default mongoose.model('RoomEmoji', RoomEmojiSchema);
