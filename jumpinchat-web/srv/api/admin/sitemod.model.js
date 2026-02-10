
import mongoose from 'mongoose';
const { Schema } = mongoose;

const SiteModSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  user: { type: Schema.Types.ObjectId, index: { unique: true }, ref: 'User' },
  userLevel: Number,
});

export default mongoose.model('SiteMod', SiteModSchema);
