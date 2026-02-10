
import express from 'express';
import createPayment from './controllers/createPayment.controller.js';
import getSubscription from './controllers/getSubscription.controller.js';
import deleteSubscription from './controllers/deleteSubscription.controller.js';
import updateSource from './controllers/updateSource.controller.js';
import stripeHook from './controllers/stripeHook.controller.js';
import addMissingSubId from './controllers/addMissingSubId.controller.js';
import createCheckoutSession from './controllers/createCheckoutSession.controller.js';
import { validateAccount, rateLimit } from '../../utils/utils.js';
const router = express.Router();

router.post('/create', rateLimit, validateAccount, createPayment);
router.post('/session', rateLimit, validateAccount, createCheckoutSession);
router.get('/subscribed/:userId', validateAccount, getSubscription);
router.delete('/subscription/:userId', validateAccount, deleteSubscription);
router.post('/stripe/event', stripeHook);
router.put('/source/update/:userId', validateAccount, updateSource);
router.post('/migrate/missingsubid', addMissingSubId);


export default router;
