
import mongoose from 'mongoose';
const { Schema } = mongoose;

const ModActivityModel = new Schema({
  createdAt: { type: Date, default: Date.now },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  action: {
    type: { type: String, required: true },
    id: { type: Schema.Types.ObjectId, default: null },
  },
});

export default mongoose.model('ModActivity', ModActivityModel);
