import logFactory from '../../../utils/logger.util.js';
import { getHostDomain } from '../../../utils/utils.js';
import errors from '../../../config/constants/errors.js';
import { getUserById } from '../../user/user.utils.js';
import paymentUtils from '../payment.utils.js';
import stripe from '../stripe.client.js';
import { productIds, productTypes, products } from '../payment.constants.js';

const log = logFactory({ name: 'createCheckoutSession.controller' });

export default async function createCheckoutSession(req, res) {
  const { product, beneficiary } = req.body;
  const amount = Number(req.body.amount);
  if (!product) return res.status(400).send({ error: 'ERR_NO_PRODUCT', message: 'Product is missing' });
  if (!Object.hasOwn(products, product)) {
    return res.status(400).send({ error: 'ERR_INVALID_PRODUCT', message: 'Invalid product' });
  }
  const isSubscription = products[product].type === productTypes.TYPE_PLAN;
  if (product === productIds.SUPPORT_ONE_TIME && req.body.amount == null) {
    return res.status(400).send({ error: 'ERR_NO_AMOUNT', message: 'An amount is required for a one-time payment' });
  }
  if ((!isSubscription || req.body.amount != null)
    && (!Number.isInteger(amount) || amount < 300 || amount > 5000)) {
    return res.status(400).send({ error: 'ERR_INVALID_AMOUNT', message: 'Amount must be between $3.00 and $50.00 in whole cents' });
  }
  if (beneficiary && isSubscription) {
    return res.status(400).send({ error: 'ERR_INVALID_BENEFICIARY', message: 'Only one-time support can be gifted' });
  }

  try {
    const user = await getUserById(req.user._id, { lean: true });
    if (!user) return res.status(500).send(errors.ERR_NO_USER);
    if (beneficiary && !await getUserById(beneficiary, { lean: true })) {
      return res.status(400).send({ error: 'ERR_NO_USER', message: 'Gift recipient does not exist' });
    }
    const existingPayment = await paymentUtils.getPaymentByUserId(user._id);
    const existingSubscription = isSubscription
      ? await paymentUtils.getPaymentByUserId(user._id, { isSubscription: true }) : null;
    if (isSubscription && (existingSubscription || user.attrs.isGold)) {
      return res.status(422).send({ error: 'ERR_SUBSCRIPTION_EXISTS', message: 'You are already subscribed, check your account settings for more information' });
    }
    const domain = getHostDomain(req);
    const options = {
      mode: isSubscription ? 'subscription' : 'payment',
      line_items: isSubscription ? [{ price: products[product].id, quantity: 1 }] : [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Site Supporter', description: `One-off supporter payment of $${amount / 100}` },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: `${domain}/support/payment/success?productId=${product}`,
      cancel_url: `${domain}/support`,
      client_reference_id: String(user._id),
      metadata: { userId: String(user._id), product },
    };
    if (existingPayment?.customerId) options.customer = existingPayment.customerId;
    else {
      if (!isSubscription) options.customer_creation = 'always';
      if (user.auth.email_is_verified) options.customer_email = user.auth.email;
    }
    const session = await stripe.checkout.sessions.create(options);
    if (!session.url) throw new Error('Checkout URL missing');
    await paymentUtils.saveCheckoutSession(user._id, session.id, beneficiary);
    return res.status(201).send({ id: session.id, url: session.url });
  } catch (err) {
    log.error({ err }, 'failed to create checkout session');
    return res.status(500).send(errors.ERR_SRV);
  }
}
