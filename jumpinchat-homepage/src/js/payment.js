function showPending(form, pending) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = pending;
  button.classList.toggle('u-hidden', pending);
  form.querySelector('#loading').classList.toggle('u-hidden', !pending);
}

export function initializePaymentForms({
  document: page = document,
  createStripe = window.Stripe,
  request = window.fetch.bind(window),
  navigate = url => window.location.assign(url),
} = {}) {
  const checkout = page.getElementById('payment-form');
  if (checkout) {
    checkout.addEventListener('submit', (event) => {
      event.preventDefault();
      if (checkout.querySelector('button[type="submit"]').disabled) return;
      const error = checkout.querySelector('#card-errors');
      error.textContent = '';
      showPending(checkout, true);
      try {
        if (!checkout.dataset.checkoutUrl) throw new Error('Checkout is unavailable. Please reload the page and try again.');
        navigate(checkout.dataset.checkoutUrl);
      } catch (err) {
        error.textContent = err.message || 'Failed to open Checkout';
        showPending(checkout, false);
      }
    });
  }

  const form = page.getElementById('update-source-form');
  if (!form) return;
  const error = form.querySelector('#card-errors');
  let stripe;
  let card;
  try {
    stripe = createStripe(form.dataset.stripeKey);
    card = stripe.elements().create('card');
    card.mount(form.querySelector('#card-element'));
  } catch (err) {
    error.textContent = 'Payment details could not be loaded. Please reload the page and try again.';
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  card.on('change', event => { error.textContent = event.error?.message || ''; });
  let submitting = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    error.textContent = '';
    showPending(form, true);
    try {
      const response = await request(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'setupPayment' }),
      });
      const data = await response.json();
      if (!response.ok || !data.clientSecret) throw new Error(data.message || 'Failed to prepare payment method update');
      const billingDetails = { name: form.querySelector('#card-name').value };
      const email = form.querySelector('#card-email')?.value || form.dataset.email;
      if (email) billingDetails.email = email;
      const result = await stripe.confirmCardSetup(data.clientSecret, {
        payment_method: { card, billing_details: billingDetails },
      });
      if (result.error) throw new Error(result.error.message || 'Failed to confirm payment method');
      if (result.setupIntent?.status !== 'succeeded') throw new Error('Payment method confirmation is incomplete. Please try again.');
      const hiddenInput = page.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.name = 'setupIntentId';
      hiddenInput.value = result.setupIntent.id;
      form.appendChild(hiddenInput);
      form.submit();
    } catch (err) {
      error.textContent = err.message || 'Failed to update payment method';
      submitting = false;
      showPending(form, false);
    }
  });
}
