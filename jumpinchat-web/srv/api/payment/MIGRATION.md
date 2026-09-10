# Stripe 22 payment migration

This change updates hosted Checkout, subscription details, saved-card changes,
and fulfillment together. Deploy the homepage and web API from the same revision.
No live Stripe account, payment, webhook endpoint or production database was
changed during development.

## API and account configuration

The shared lazy client pins requests to `2026-08-26.dahlia`, the API version in
Stripe SDK 22.6.1. An absent Stripe secret key leaves the chat application available
and returns 503 from payment routes. An absent webhook signing key returns 503
from the webhook; configure both keys before reopening checkout.

Checkout creation returns `{id, url}`. The homepage redirects to that URL using
`location.assign`; Stripe removed `redirectToCheckout` from Stripe.js. Card changes
create an account-bound SetupIntent, use `confirmCardSetup`, and accept its ID only
after checking the succeeded state, customer, account metadata and attached card
PaymentMethod. Both subscription and customer invoice defaults are updated.
Legacy `/payment/create`, `/payment/source/update/:userId` and the unused
`/payment/migrate/missingsubid` endpoint are removed. No card details pass through
the application server. See Stripe's [redirect migration](https://docs.stripe.com/changelog/clover/2025-09-30/remove-redirect-to-checkout)
and [SetupIntent reference](https://docs.stripe.com/api/setup_intents/object).

Keep the existing monthly/annual identifiers in `payment.constants.js` until the
account owner verifies replacement prices. Prices are backwards compatible with
Plans; the migration does not create or change Stripe products, prices or existing
subscriptions. Confirm those identifiers and their currencies/intervals in the
intended test/live account before rollout. See the [Plans/Prices compatibility
reference](https://docs.stripe.com/api/plans).

Configure the existing `/api/payment/stripe/event` endpoint for these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `invoice.payment_succeeded`
- `customer.subscription.deleted`

The endpoint verifies Stripe's signature over the raw request body. API request
version and webhook endpoint version are separate settings: incoming Checkout
and Invoice objects are retrieved again through the pinned client before their
payment fields are used. Invalid signatures receive 400; processing failures
receive 500 so delivery can be retried. Unpaid Checkout completion waits for the
subsequent successful payment event. Monitor failing/retrying events in Stripe
throughout cutover; a successful HTTP acknowledgment from the old implementation
alone does not prove that it granted support.

## Required legacy checkout reconciliation

Historical CheckoutSession documents do not say whether their supporter grant
was applied. Historical Payment documents also lack a Checkout Session ID.
There is no safe automatic conversion of that history. New sessions explicitly
store `fulfillmentVersion: 2`; the schema deliberately has no default that would
silently apply version 2 to old rows. A paid unversioned session fails with a
retriable error until an operator reconciles it.

1. Temporarily hold new checkout creation at the application/proxy while keeping
   the existing webhook available. Back up the database and record the cutover
   time and pending Stripe deliveries. Let existing sessions settle, or expire
   open sessions through the account's normal Stripe controls. Account for delayed
   payments and already-completed sessions whose webhook is still pending.
2. Reconcile each relevant historical local session with its Stripe Checkout,
   payment/invoice and subscription records **and evidence of the supporter grant
   actually applied in this application**. Record the local session ID, payer,
   recipient, Stripe IDs, outcome and operator decision in the cutover record.
   A payment receipt alone does not establish whether its entitlement was granted.
   Keep uncertain sessions on hold; do not bulk-mark all old rows fulfilled and
   do not bulk-enable version 2 fulfillment.
3. For a session verified as already granted, set `fulfilledAt` on that exact local
   record. For a paid session verified as never granted, set `fulfillmentVersion`
   to 2 on that exact record, then redeliver its successful payment event after
   deployment. Resolve any partially applied legacy gift/subscription manually
   before enabling its retry. Leave expired/unpaid sessions closed.
4. Deploy both application packages and verify the storage gate below. Validate
   the account keys, signing secret and subscribed events. Existing subscription
   renewal/cancellation continues using its existing Payment record; it does not
   require automatically backfilling historical Checkout sessions.
5. Reopen checkout after a Stripe test-mode end-to-end check of one-time payment,
   gift, monthly/annual subscription, card authentication/update, cancellation and
   a repeated webhook. That account-level check was not performed by local tests.
   Confirm successful deliveries and reconcile any retained failures.

For an already-granted session, the following narrowly scoped Mongo operation is
an example only; replace the ID and verified timestamp from the reconciliation
record. Run against the intended database after backing it up and inspect the
matched count (exactly one). Do not infer a timestamp or outcome from this example.

```javascript
db.checkoutsessions.updateOne(
  { checkoutSessionId: 'VERIFIED_CHECKOUT_ID', fulfilledAt: null },
  { $set: { fulfilledAt: ISODate('VERIFIED_GRANT_TIME') } }
);
```

For a verified never-granted payment, use the same exact-ID and `fulfilledAt: null`
filter with `{ $set: { fulfillmentVersion: 2 } }`, then redeliver. Do not add a user
replay marker without the matching grant: the runtime writes both atomically.

## Durable grants and required index

Before accepting payment routes, the API awaits creation/verification of the
named unique `payment_checkout_session_unique` index on `payments.checkoutSessionId`.
Its partial filter includes only strings, so historical rows without an ID remain
valid. This runs explicitly even when production Mongoose `autoIndex` is false;
index errors return 503 and are retried on a later request. The application's
MongoDB role must permit creating this index, or the database operator must create
the identical index first:

```javascript
db.payments.createIndex(
  { checkoutSessionId: 1 },
  {
    name: 'payment_checkout_session_unique',
    unique: true,
    partialFilterExpression: { checkoutSessionId: { $type: 'string' } }
  }
);
```

Fulfillment acquires a two-minute lease on the local CheckoutSession. The supporter
expiry and `attrs.appliedCheckoutSessions` marker are one atomic user update.
After a crash, the lease expires; retrying the grant is a no-op if its marker is
already present, and payment recording/completion can resume. A stale worker
cannot complete another worker's lease. The unique payment index also deduplicates
overlapping record writes. Cancellation clears subscription fields but retains
the payment row and checkout key, so a stale worker cannot recreate a canceled
subscription with a late insert. Never clear a live lease to force a second worker;
resolve the failure and allow expiry/retry.

Keep completed sessions and user replay markers while the corresponding events
can be redelivered. There is no automatic marker eviction: removing them would
allow an old event to extend support again. Their growth is acceptable for the
current low-volume supporter feature; monitor document size before introducing
bulk purchases or a retention change. Both user schemas exclude markers from
normal queries and strip them from document JSON/object serialization.

Supporter trophies/messages and the optional configured Slack notification are
best effort after durable completion. A crash can omit a notification; retries do
not intentionally resend it or grant supporter time twice. No webhook credential
is embedded in source.

## Support duration behavior

A one-time payment still adds 14 days per $3, starting at the later of the existing
expiry and the database's current time. Distinct gifts accumulate even when they
arrive simultaneously.

Subscription grants and renewals now use the actual paid invoice's period end,
for monthly and annual plans. They take the later of that date and the current
expiry, making repeated/out-of-order invoices harmless and preserving later gift
coverage. This replaces the old fixed 31-day initial extension and renewal reset.
It also means gifts and a subscription can overlap: if donated time ends May 20
and a paid monthly invoice runs May 1–June 1, expiry becomes June 1, not June 20.
A separate bank of unused donated days is not modeled by the current schema.

An invoice arriving before a known new checkout has fulfilled receives a retriable
failure, so later paid coverage is not lost. Cancellation is serialized against
checkout fulfillment and reconciled again after lookup; a late checkout event
preserves already-paid supporter coverage without recreating canceled gold status.
Canceling an old subscription does not clear a newer subscription's gold status.

Rollback must preserve this fulfillment implementation or hold payment/event
processing until its replacement understands version 2 markers. The old handler
does not honor these markers and must not process version 2 payment replays.

## Local validation

The payment unit suite has 54 passing cases, including real SDK-generated local
webhook signatures, owner/customer/confirmation checks, delayed payment, gift,
annual, cancellation and failure/retry behavior. The homepage has 22 focused
payment route/browser cases. All provider calls are doubled; no real card or
account is used.

`test/payment/fulfillment.mongo.spec.js` adds 18 cases against actual MongoDB 8.3:
concurrent date-pipeline grants, distinct gifts, injected post-grant failure,
lease recovery/fencing, real unique-index enforcement with automatic indexing
disabled, serialization, annual/late invoices and cancellation races. Four cases
exercise the legacy reconciliation procedure above: an uncertain paid session
remains blocked, an already-granted session is acknowledged without another
grant, a verified never-granted session grants once, and an unpaid session remains
unchanged. These use synthetic records and doubled Stripe responses. The shared
`scripts/test-runtime.mjs` harness executes it against a fresh temporary database
and checks application runtime/backup restoration separately.

For a standalone run against an explicitly provided disposable local MongoDB:

```bash
cd jumpinchat-web
PAYMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27017/unused NODE_ENV=test \
  npx mocha --loader=esmock -t 10000 test/payment/fulfillment.mongo.spec.js
```

The suite requires a loopback URI, creates a uniquely named test database with
`autoIndex: false`, and drops only that database afterward. Strict provider mocks
prevent unrelated Redis clients from being initialized; the process must exit
naturally so leaked connections fail the runtime harness timeout.
