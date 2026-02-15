import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const recentRoomsSchema = new Schema({
  user: Schema.Types.ObjectId,
  rooms: [{
    roomId: { type: Schema.Types.ObjectId, ref: 'Room' },
    createdAt: { type: Date, default: Date.now },
  }],
});

export default model('RecentRooms', recentRoomsSchema);
