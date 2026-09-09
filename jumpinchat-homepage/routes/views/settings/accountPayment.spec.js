import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import pug from 'pug';
import { fileURLToPath } from 'node:url';

describe('account payment method view', () => {
  let account;
  let axios;
  let req;
  let res;

  beforeEach(async () => {
    axios = sinon.stub().callsFake(async ({ method }) => (method === 'GET'
      ? { status: 200, data: { plan: { name: 'Monthly', created: '2026-09-09' }, source: null } }
      : { status: 200, data: { clientSecret: 'seti_test_secret' } }));
    account = await esmock.strict('./account.js', {
      axios: { default: axios },
      bcrypt: { default: {} },
      jsonwebtoken: { default: { sign: sinon.stub().returns('owner-token') } },
      '../../../config/index.js': { default: { auth: { jwtSecret: 'test' } } },
      '../../../constants/constants.js': { api: 'http://api', errors: { ERR_SRV: 'Server error' }, successMessages: {} },
      '../../../utils/userUtils.js': { generatePassHash() {} },
      '../../../utils/request.js': { default: sinon.stub() },
      '../../../models/index.js': { User: {} },
      '../../../utils/logger.js': { default: () => ({ warn() {}, debug() {}, fatal() {}, error() {} }) },
    });
    req = { method: 'GET', query: {}, body: {}, user: { _id: 'owner', attrs: {}, auth: { email: 'owner@example.com' } } };
    res = { locals: {}, status: sinon.stub().returnsThis(), set: sinon.spy(), json: sinon.spy(), send: sinon.spy(), redirect: sinon.spy(), render: sinon.spy() };
  });

  it('does not create a SetupIntent during an ordinary settings page request', async () => {
    await account(req, res);
    expect(axios.calledOnce).to.equal(true);
    expect(axios.firstCall.args[0].method).to.equal('GET');
  });

  it('does not show a subscription error when payment support is disabled', async () => {
    res.locals.supportEnabled = false;
    await account(req, res);
    expect(axios.called).to.equal(false);
    expect(res.locals.error).to.equal(null);
  });

  it('uses the authenticated account for on-demand SetupIntent creation', async () => {
    req.method = 'POST';
    req.body = { action: 'setupPayment', userId: 'other-user' };
    await account(req, res);
    expect(axios.calledOnce).to.equal(true);
    expect(axios.firstCall.args[0]).to.include({ url: 'http://api/api/payment/method/setup/owner', method: 'POST' });
    expect(axios.firstCall.args[0].headers).to.deep.equal({ Authorization: 'owner-token' });
    expect(res.set.firstCall.args).to.deep.equal(['Cache-Control', 'no-store']);
    expect(res.json.firstCall.args[0]).to.deep.equal({ clientSecret: 'seti_test_secret' });
  });

  it('returns an authentication error when the setup request session has expired', async () => {
    req.method = 'POST';
    req.body = { action: 'setupPayment' };
    req.user = null;
    await account(req, res);
    expect(res.status.firstCall.args[0]).to.equal(401);
    expect(axios.called).to.equal(false);
  });

  it('returns API errors as JSON for the card form', async () => {
    axios.resolves({ status: 403, data: { message: 'Subscription unavailable' } });
    req.method = 'POST';
    req.body = { action: 'setupPayment' };
    await account(req, res);
    expect(res.status.firstCall.args[0]).to.equal(403);
    expect(res.json.firstCall.args[0]).to.deep.equal({ message: 'Subscription unavailable' });
  });

  it('forwards only the SetupIntent identifier and redirects to refreshed account details', async () => {
    req.method = 'POST';
    req.body = { action: 'updatePayment', setupIntentId: 'seti_confirmed', stripeToken: 'obsolete', userId: 'other-user' };
    await account(req, res);
    const update = axios.getCalls().find(call => call.args[0].method === 'PUT').args[0];
    expect(update.url).to.equal('http://api/api/payment/method/owner');
    expect(update.data).to.deep.equal({ setupIntentId: 'seti_confirmed' });
    expect(update.headers).to.deep.equal({ Authorization: 'owner-token' });
    expect(res.redirect.firstCall.args[0]).to.include('/settings/account?success=');
  });

  it('rejects the obsolete source payload without a payment update request', async () => {
    req.method = 'POST';
    req.body = { action: 'updatePayment', stripeToken: 'src_old' };
    await account(req, res);
    expect(axios.getCalls().some(call => call.args[0].method === 'PUT')).to.equal(false);
    expect(res.status.firstCall.args[0]).to.equal(400);
  });

  it('renders an active subscription with no available card details', () => {
    const render = pug.compileFile(fileURLToPath(new URL('../../../templates/views/settings/account.pug', import.meta.url)));
    const html = render({
      user: req.user, subscription: { plan: { name: 'Monthly', created: '2026-09-09' }, source: null },
      navLinks: [], asset: value => value, brandMap: {},
    });
    expect(html).to.include('No card details are available');
    expect(html).to.include('update-source-form');
    expect(html).not.to.include('createSource');
  });
});
