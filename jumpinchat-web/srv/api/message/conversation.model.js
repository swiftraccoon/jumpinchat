
import mongoose from 'mongoose';
const { Schema } = mongoose;

const ConversationSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  latestMessage: Date,
  participants: [
    { type: Schema.Types.ObjectId, ref: 'User' },
  ],
  archived: [
    {
      participant: { type: Schema.Types.ObjectId, ref: 'User' },
      isArchived: { type: Boolean, default: false },
    },
  ],
});

export default mongoose.model('Conversation', ConversationSchema);
