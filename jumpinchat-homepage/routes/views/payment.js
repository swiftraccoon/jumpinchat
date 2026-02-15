import querystring from 'querystring';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { api, errors, products } from '../../constants/constants.js';
import {
  getUserById,
} from '../../utils/userUtils.js';

const log = logFactory({ name: 'routes.support' });

export default async function payment(req, res) {
  const { locals } = res;

  const productIdMap = Object
    .keys(products)
    .reduce((acc, current) => ({ ...acc, [current]: current }), {});

  locals.page = req.params.page;
  locals.section = 'Payment';
  locals.user = req.user;
  locals.key = config.stripe.publicKey;
  locals.productIdMap = productIdMap;
  locals.checkoutSessionId = null;

  // Init phase
  if (!locals.user) {
    log.warn('no user');
    return res.redirect('/');
  }

  const {
    productId,
    amount,
    beneficiary,
  } = req.query;

  if (!productId || !productIdMap[productId]) {
    locals.error = 'Invalid product';
    return res.render('payment');
  }

  if (productId === productIdMap.onetime && !amount) {
    locals.error = 'Amount missing';
    return res.render('payment');
  }

  locals.productId = productId;
  locals.product = products[productId];
  locals.beneficiary = beneficiary;

  if (beneficiary) {
    try {
      locals.beneficiaryUser = await getUserById(beneficiary);
      log.debug({ user: locals.beneficiaryUser }, 'beneficiary user');
    } catch (err) {
      log.fatal({ err }, 'failed to get beneficiary user');
      return res.status(500).send(errors.ERR_SRV);
    }
  }

  if (amount) {
    locals.product.amount = amount;
  }

  const token = jwt.sign(String(locals.user._id), config.auth.jwtSecret);

  const query = {
    product: locals.productId,
  };

  if (locals.beneficiary) {
    query.beneficiary = locals.beneficiary;
  }

  let sessionUrl = `${api}/api/payment/session?${querystring.stringify(query)}`;

  if (locals.productId === productIdMap.onetime) {
    sessionUrl = `${sessionUrl}&amount=${products[locals.productId].amount}`;
  }

  try {
    const response = await axios({
      url: sessionUrl,
      method: 'POST',
      data: {
        product: productId,
        amount,
        beneficiary,
      },
      headers: {
        Authorization: token,
      },
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      log.warn({ body: response.data, status: response.status }, 'failed to create payment');
      if (response.data && response.data.message) {
        return res.redirect(`/support/payment/failed?${querystring.stringify({
          reason: response.data.message,
        })}`);
      }
      log.warn('failed to create payment', { body: response.data, code: response.status });
    }

    locals.checkoutSessionId = response.data;
  } catch (err) {
    return res.status(500).send();
  }

  // POST handling
  if (req.method === 'POST' && req.body.action === 'payment') {
    locals.error = null;

    try {
      const payResponse = await axios({
        url: sessionUrl,
        method: 'POST',
        data: req.body,
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (payResponse.status >= 400) {
        log.warn({ body: payResponse.data, status: payResponse.status }, 'failed to create payment');
        if (payResponse.data && payResponse.data.message) {
          return res.redirect(`/support/payment/failed?${querystring.stringify({
            reason: payResponse.data.message,
          })}`);
        }

        log.warn('failed to create payment', { body: payResponse.data, code: payResponse.status });
        return res.redirect(`/support/payment/failed?${querystring.stringify({
          reason: 'Payment failed',
        })}`);
      }

      const productValue = products[locals.productId].amount;
      return res.redirect(`/support/payment/success?productId=${locals.productId}&value=${productValue}`);
    } catch (err) {
      return res.status(500).send();
    }
  }

  return res.render('payment');
}
