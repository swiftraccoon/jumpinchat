
import mongoose from 'mongoose';
const { Schema } = mongoose;

const PaymentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  customerId: String,
  subscription: {
    id: String,
    planId: String,
    productId: String,
  },
  beneficiary: { type: Schema.Types.ObjectId, ref: 'User' },
});

export default mongoose.model('Payment', PaymentSchema);
