import config from '../../../config/env/index.js';
import stripe from '../stripe.client.js';
import logFactory from '../../../utils/logger.util.js';
import { stripeEvents } from '../payment.constants.js';
import fulfillPayment from './fulfillPayment.controller.js';
import { handleSubscriptionDeleted, renewSubscription } from '../payment.utils.js';

const log = logFactory({ name: 'stripeEvent.controller' });
export default async function stripeHook(req, res) {
  if (!config.payment.stripe.whKey) return res.status(503).send({ message: 'Payment webhook is not configured' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.payment.stripe.whKey);
  } catch (err) {
    log.warn({ errorType: err.type }, 'invalid Stripe webhook signature');
    return res.status(400).send({ message: 'Invalid webhook signature' });
  }
  log.info({ eventId: event.id, type: event.type }, 'stripe.event');
  try {
    switch (event.type) {
      case stripeEvents.SUBSCRIPTION_DELETE: {
        await handleSubscriptionDeleted(event.data.object);
        break;
      }
      case stripeEvents.INVOICE_PAID: {
        // Request the pinned API shape rather than assuming the endpoint's version.
        const invoice = await stripe.invoices.retrieve(event.data.object.id);
        await renewSubscription(invoice);
        break;
      }
      case stripeEvents.SESSION_COMPLETED:
      case stripeEvents.SESSION_PAID:
        await fulfillPayment(event.data.object);
        break;
      default:
        break;
    }
    return res.status(200).send({ received: true });
  } catch (err) {
    log.error({ err, eventId: event.id }, 'failed to process Stripe webhook; retry required');
    return res.status(500).send({ message: 'Payment event could not be processed' });
  }
}
