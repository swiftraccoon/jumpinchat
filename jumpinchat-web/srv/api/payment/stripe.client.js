import Stripe from 'stripe';
import config from '../../config/env/index.js';

// Pin requests independently of the account default and webhook endpoint version.
export const STRIPE_API_VERSION = '2026-08-26.dahlia';
export const isStripeConfigured = () => Boolean(config.payment.stripe.secretKey);
let client;

// Payments are optional: importing API routes must not require a configured key.
export default new Proxy({}, {
  get(_target, property) {
    if (!isStripeConfigured()) throw new Error('Payments are not configured');
    client ??= new Stripe(config.payment.stripe.secretKey, { apiVersion: STRIPE_API_VERSION });
    return client[property];
  },
});
