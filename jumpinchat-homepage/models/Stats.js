import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const statsSchema = new Schema({
  createdAt: { type: Date },
  rooms: [{
    name: String,
    users: Number,
    broadcasters: Number,
  }],
});

statsSchema.index({ createdAt: 1 });

export default model('Stats', statsSchema);
