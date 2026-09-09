import { expect } from 'chai';
import sinon from 'sinon';
import { JSDOM } from 'jsdom';
import { initializePaymentForms } from './payment.js';

const cardMarkup = `
  <form id="update-source-form" method="post" data-stripe-key="pk_test" data-email="verified@example.com">
    <input name="action" value="updatePayment" type="hidden">
    <input id="card-name" value="Card Owner">
    <div id="card-element"></div>
    <span id="card-errors" role="alert"></span>
    <button type="submit">Update</button>
    <span id="loading" class="u-hidden"></span>
  </form>`;

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('payment browser flows', () => {
  let dom;
  let request;
  let navigate;
  let createStripe;
  let stripe;
  let card;
  let form;

  beforeEach(() => {
    dom = new JSDOM(cardMarkup, { url: 'https://jumpin.example/settings/account' });
    request = sinon.stub().resolves({ ok: true, json: async () => ({ clientSecret: 'seti_test_secret' }) });
    navigate = sinon.spy();
    card = { mount: sinon.spy(), on: sinon.spy() };
    stripe = {
      elements: () => ({ create: sinon.stub().returns(card) }),
      confirmCardSetup: sinon.stub().resolves({ setupIntent: { id: 'seti_confirmed', status: 'succeeded' } }),
    };
    createStripe = sinon.stub().returns(stripe);
    form = dom.window.document.querySelector('form');
    form.submit = sinon.spy();
  });

  afterEach(() => dom.window.close());

  function initialize() {
    initializePaymentForms({ document: dom.window.document, createStripe, request, navigate });
  }

  function submit() {
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    return settle();
  }

  it('creates a SetupIntent only on submit and forwards the confirmed identifier', async () => {
    initialize();
    expect(request.called).to.equal(false);
    expect(card.mount.firstCall.args[0]).to.equal(dom.window.document.getElementById('card-element'));
    await submit();
    expect(request.firstCall.args[0]).to.equal('https://jumpin.example/settings/account');
    expect(JSON.parse(request.firstCall.args[1].body)).to.deep.equal({ action: 'setupPayment' });
    expect(stripe.confirmCardSetup.firstCall.args).to.deep.equal(['seti_test_secret', {
      payment_method: { card, billing_details: { name: 'Card Owner', email: 'verified@example.com' } },
    }]);
    expect(form.elements.setupIntentId.value).to.equal('seti_confirmed');
    expect(form.elements.stripeToken).to.equal(undefined);
    expect(form.submit.calledOnce).to.equal(true);
  });

  it('uses the entered billing email when the account email is unverified', async () => {
    form.insertAdjacentHTML('beforeend', '<input id="card-email" value="billing@example.com">');
    initialize();
    await submit();
    expect(stripe.confirmCardSetup.firstCall.args[1].payment_method.billing_details.email).to.equal('billing@example.com');
  });

  it('blocks duplicate submissions while card confirmation is pending', async () => {
    let resolve;
    stripe.confirmCardSetup.returns(new Promise(done => { resolve = done; }));
    initialize();
    await submit();
    await submit();
    expect(request.callCount).to.equal(1);
    expect(form.querySelector('button').disabled).to.equal(true);
    resolve({ setupIntent: { id: 'seti_confirmed', status: 'succeeded' } });
    await settle();
    expect(form.submit.calledOnce).to.equal(true);
  });

  it('renders authentication errors safely and permits a retry', async () => {
    stripe.confirmCardSetup.onFirstCall().resolves({ error: { message: '<b>Authentication failed</b>' } });
    initialize();
    await submit();
    expect(form.submit.called).to.equal(false);
    expect(form.querySelector('#card-errors').textContent).to.equal('<b>Authentication failed</b>');
    expect(form.querySelector('#card-errors b')).to.equal(null);
    expect(form.querySelector('button').disabled).to.equal(false);
    await submit();
    expect(form.submit.calledOnce).to.equal(true);
  });

  it('handles API errors without confirming or submitting payment details', async () => {
    request.resolves({ ok: false, json: async () => ({ message: 'Please sign in again' }) });
    initialize();
    await submit();
    expect(stripe.confirmCardSetup.called).to.equal(false);
    expect(form.submit.called).to.equal(false);
    expect(form.querySelector('#card-errors').textContent).to.equal('Please sign in again');
    expect(form.querySelector('button').disabled).to.equal(false);
  });

  it('does not submit an incomplete SetupIntent', async () => {
    stripe.confirmCardSetup.resolves({ setupIntent: { id: 'seti_incomplete', status: 'requires_action' } });
    initialize();
    await submit();
    expect(form.submit.called).to.equal(false);
    expect(form.querySelector('#card-errors').textContent).to.include('incomplete');
  });

  it('does not initialize Stripe on pages without the card form', () => {
    form.remove();
    initialize();
    expect(createStripe.called).to.equal(false);
    expect(request.called).to.equal(false);
  });

  it('opens the server-provided Checkout URL without initializing Stripe', async () => {
    dom.window.document.body.innerHTML = `
      <form id="payment-form" data-checkout-url="https://checkout.stripe.com/c/pay/test">
        <button type="submit">Open checkout</button>
        <span id="loading" class="u-hidden"></span>
        <span id="card-errors" role="alert"></span>
      </form>`;
    form = dom.window.document.querySelector('form');
    initialize();
    await submit();
    expect(navigate.firstCall.args).to.deep.equal(['https://checkout.stripe.com/c/pay/test']);
    expect(createStripe.called).to.equal(false);
    expect(request.called).to.equal(false);
  });
});
