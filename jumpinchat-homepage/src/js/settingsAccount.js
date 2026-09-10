import { onReady } from './dom.js';

export function initAccountSettings(root = document) {
  const resendButton = root.querySelector('#send-verification-email');
  const isVerifiedString = root.querySelector('#is-verified-string');

  if (!resendButton || !isVerifiedString) {
    return;
  }

  resendButton.addEventListener('click', async () => {
    let response;
    try {
      response = await fetch('/api/user/verify/email', { method: 'POST', credentials: 'same-origin' });
    } catch (err) {
      return;
    }

    if (response.status === 429) {
      isVerifiedString.textContent = 'Too many attempts, try again in a few minutes';
      return;
    }

    if (!response.ok) {
      return;
    }

    resendButton.remove();
    isVerifiedString.classList.remove('text--red');
    isVerifiedString.classList.add('text--green');
    isVerifiedString.textContent = 'Verification email sent.';
  });
}

onReady(() => initAccountSettings());
