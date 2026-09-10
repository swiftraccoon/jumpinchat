import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import pug from 'pug';
import { fileURLToPath } from 'node:url';

describe('Checkout payment view', () => {
  let payment;
  let axios;
  let req;
  let res;
  let products;
  let getUserById;

  beforeEach(async () => {
    axios = sinon.stub().resolves({ status: 200, data: { id: 'cs_test', url: 'https://checkout.stripe.com/c/pay/test' } });
    products = { onetime: { amount: 300 }, monthly: { amount: 500 } };
    getUserById = sinon.stub().resolves({ username: 'gift-recipient' });
    payment = await esmock.strict('./payment.js', {
      axios: { default: axios },
      jsonwebtoken: { default: { sign: sinon.stub().returns('owner-token') } },
      '../../config/index.js': { default: { auth: { jwtSecret: 'test' } } },
      '../../constants/constants.js': { api: 'http://api', errors: { ERR_SRV: 'Server error' }, products },
      '../../utils/userUtils.js': { getUserById },
      '../../utils/logger.js': { default: () => ({ warn() {}, debug() {}, fatal() {} }) },
    });
    req = { method: 'GET', params: {}, query: { productId: 'monthly' }, body: {}, user: { _id: 'owner' } };
    res = { locals: { supportEnabled: true }, status: sinon.stub().returnsThis(), send: sinon.spy(), redirect: sinon.spy(), render: sinon.spy() };
  });

  for (const method of ['GET', 'POST']) {
    it(`redirects disabled ${method} checkout to the support explanation without API work`, async () => {
      req.method = method;
      req.query = { productId: 'onetime', amount: '300', beneficiary: 'recipient' };
      res.locals.supportEnabled = false;
      await payment(req, res);
      expect(res.redirect.calledOnceWithExactly('/support')).to.equal(true);
      expect(axios.called).to.equal(false);
      expect(getUserById.called).to.equal(false);
      expect(res.render.called).to.equal(false);
    });
  }

  it('renders the Checkout URL and authenticates one session creation request', async () => {
    await payment(req, res);
    expect(res.locals.checkoutUrl).to.equal('https://checkout.stripe.com/c/pay/test');
    expect(axios.calledOnce).to.equal(true);
    expect(axios.firstCall.args[0].headers).to.deep.equal({ Authorization: 'owner-token' });
    expect(res.render.firstCall.args[0]).to.equal('payment');
  });

  it('does not create a duplicate payment for the obsolete POST action', async () => {
    req.method = 'POST';
    req.body = { action: 'payment', stripeToken: 'old-token' };
    await payment(req, res);
    expect(axios.calledOnce).to.equal(true);
    expect(axios.firstCall.args[0].data).not.to.have.property('stripeToken');
    expect(res.redirect.called).to.equal(false);
  });

  it('keeps donation amounts local to the request', async () => {
    req.query = { productId: 'onetime', amount: '1200' };
    await payment(req, res);
    expect(res.locals.product.amount).to.equal('1200');
    expect(products.onetime.amount).to.equal(300);
    expect(axios.firstCall.args[0].url).to.include('amount=1200');
  });

  it('redirects failed session creation to the failure page', async () => {
    axios.resolves({ status: 400, data: { message: 'Invalid amount' } });
    await payment(req, res);
    expect(res.redirect.firstCall.args[0]).to.equal('/support/payment/failed?reason=Invalid%20amount');
    expect(res.render.called).to.equal(false);
  });

  it('rejects a missing Checkout URL', async () => {
    axios.resolves({ status: 200, data: { id: 'cs_missing_url' } });
    await payment(req, res);
    expect(res.status.firstCall.args[0]).to.equal(500);
    expect(res.render.called).to.equal(false);
  });

  it('can render a validation error without dereferencing a missing product', () => {
    const render = pug.compileFile(fileURLToPath(new URL('../../templates/views/payment.pug', import.meta.url)));
    expect(() => render({ error: 'Invalid product', navLinks: [], asset: value => value })).not.to.throw();
  });
});
