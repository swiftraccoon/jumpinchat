
import mongoose from 'mongoose';
const { Schema } = mongoose;

const PaymentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  customerId: String,
  checkoutSessionId: String,
  subscription: {
    id: String,
    planId: String,
    productId: String,
  },
  beneficiary: { type: Schema.Types.ObjectId, ref: 'User' },
});

PaymentSchema.index({ checkoutSessionId: 1 }, {
  name: 'payment_checkout_session_unique', unique: true,
  partialFilterExpression: { checkoutSessionId: { $type: 'string' } },
});

export default mongoose.model('Payment', PaymentSchema);
