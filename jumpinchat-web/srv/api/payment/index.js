
import express from 'express';
import { isStripeConfigured } from './stripe.client.js';
import { ensurePaymentIndexes } from './payment.utils.js';
import getSubscription from './controllers/getSubscription.controller.js';
import deleteSubscription from './controllers/deleteSubscription.controller.js';
import updateSource from './controllers/updateSource.controller.js';
import stripeHook from './controllers/stripeHook.controller.js';
import createSetupIntent from './controllers/createSetupIntent.controller.js';
import createCheckoutSession from './controllers/createCheckoutSession.controller.js';
import { validateAccount, rateLimit } from '../../utils/utils.js';
const router = express.Router();
router.use(async (_req, res, next) => {
  if (!isStripeConfigured()) return res.status(503).send({ message: 'Payments are not configured' });
  try { await ensurePaymentIndexes(); }
  catch { return res.status(503).send({ message: 'Payment storage is not ready' }); }
  return next();
});

router.post('/session', rateLimit, validateAccount, createCheckoutSession);
router.get('/subscribed/:userId', validateAccount, getSubscription);
router.delete('/subscription/:userId', validateAccount, deleteSubscription);
router.post('/stripe/event', stripeHook);
router.post('/method/setup/:userId', rateLimit, validateAccount, createSetupIntent);
router.put('/method/:userId', rateLimit, validateAccount, updateSource);


export default router;
