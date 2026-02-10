
import mongoose from 'mongoose';
const { Schema } = mongoose;

const RecentRoomsSchema = new Schema({
  rooms: [{
    roomId: Schema.Types.ObjectId,
    createdAt: { type: Date, default: Date.now },
  }],
  user: Schema.Types.ObjectId,
});

export default mongoose.model('RecentRooms', RecentRoomsSchema);
