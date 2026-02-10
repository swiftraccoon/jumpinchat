
import mongoose from 'mongoose';
const { Schema } = mongoose;

const CheckoutSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  checkoutSessionId: String,
  beneficiary: { type: Schema.Types.ObjectId, ref: 'User' },
});

export default mongoose.model('CheckoutSession', CheckoutSessionSchema);
