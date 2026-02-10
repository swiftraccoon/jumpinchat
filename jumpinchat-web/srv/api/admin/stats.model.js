
import mongoose from 'mongoose';
const { Schema } = mongoose;

const StatsSchema = new Schema({
  createdAt: { type: Date, index: true },
  rooms: [{
    name: String,
    users: Number,
    broadcasters: Number,
  }],
});

export default mongoose.model('Stats', StatsSchema);
