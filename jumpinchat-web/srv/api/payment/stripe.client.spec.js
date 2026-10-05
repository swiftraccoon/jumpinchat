import { execFileSync } from 'node:child_process';

describe('Stripe client API version', () => {
  function checkClient(secretKey, assertions) {
    // Isolate the singleton and its environment; constructing the real SDK does
    // not make provider requests. No account, webhook or payment is contacted.
    execFileSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const { default: client, STRIPE_API_VERSION, isStripeConfigured } =
        await import(${JSON.stringify(new URL('./stripe.client.js', import.meta.url).href)});
      ${assertions}
    `], {
      env: { ...process.env, NODE_ENV: 'development', STRIPE_SK: secretKey },
      encoding: 'utf8',
    });
  }

  it('pins the Endive API on the real SDK 23 client', () => {
    checkClient('sk_test_fixture', `
      assert.equal(STRIPE_API_VERSION, '2026-09-30.endive');
      assert.equal(isStripeConfigured(), true);
      assert.equal(client.getApiField('version'), '2026-09-30.endive');
      assert.equal(typeof client.setupIntents.create, 'function');
      assert.equal(client.checkout, client.checkout);
    `);
  });

  it('imports safely and keeps optional payments disabled without a key', () => {
    checkClient('', `
      assert.equal(isStripeConfigured(), false);
      assert.throws(() => client.checkout, /Payments are not configured/);
    `);
  });
});
