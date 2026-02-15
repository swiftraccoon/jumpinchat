import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const trophySchema = new Schema({
  name: String,
  image: String,
  description: { type: String, default: null },
  title: String,
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

export default model('Trophy', trophySchema);
