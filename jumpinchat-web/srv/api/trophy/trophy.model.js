
import mongoose from 'mongoose';
const { Schema } = mongoose;

const TrophySchema = new Schema({
  name: String,
  image: {
    type: String,
    default: '/images/trophies/trophy-placeholder.png',
  },
  title: String,
  description: { type: String, default: null },
  type: String,
  conditions: {
    date: {
      day: Number,
      month: Number,
      year: Number,
    },
    duration: {
      years: Number,
    },
  },
});

export default mongoose.model('Trophy', TrophySchema);
