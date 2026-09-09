import sinon from 'sinon';
export const logger = { default: () => ({ debug() {}, info() {}, warn() {}, error() {}, fatal() {} }) };
export function response() {
  const res = { status: sinon.stub(), send: sinon.stub() };
  res.status.returns(res);
  return res;
}
export const accountPayment = { _id: 'payment_1', userId: 'user_1', customerId: 'cus_1',
  subscription: { id: 'sub_1', planId: 'price_1' } };
export const user = { _id: 'user_1', auth: { email: 'user@example.test', email_is_verified: true }, attrs: { isGold: false } };
