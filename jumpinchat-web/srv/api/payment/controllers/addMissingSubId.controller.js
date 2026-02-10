
import Stripe from 'stripe';
import logFactory from '../../../utils/logger.util.js';
import paymentModel from '../payment.model.js';
import config from '../../../config/env/index.js';
const log = logFactory({ name: 'migrate trophies' });
const stripeClient = new Stripe(config.payment.stripe.secretKey);

export default async function addMissingSubId(req, res) {
  let payments;

  try {
    payments = await paymentModel.find({
      $and: [
        { 'subscription.planId': { $ne: null } },
        { 'subscription.id': null },
      ],
    }).exec();
  } catch (err) {
    return res.status(500).send(err);
  }

  payments.forEach(async (payment) => {
    const { customerId } = payment;
    const response = await stripeClient.subscriptions.list({ customer: customerId })

    if (response) {
      const { data } = response;
      const [subscription] = data;
      payment.subscription.id = subscription.id;

      try {
        await payment.save();
      } catch (err) {
        log.fatal({ err });
      }
    }
  });

  return res.status(200).send();
};
