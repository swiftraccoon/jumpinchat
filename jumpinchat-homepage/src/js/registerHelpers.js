import { onReady } from './dom.js';

async function checkUsername(username) {
  const response = await fetch(`/api/user/checkusername/${encodeURIComponent(username)}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });

  try {
    return await response.json();
  } catch (err) {
    return undefined;
  }
}

export function initRegisterHelpers(root = document) {
  const usernameInput = root.querySelector('#register-form [name="username"]');
  const usernameText = root.querySelector('#register-form .register__UsernameText');
  const registerSubmit = root.querySelector('#register-form [type="submit"]');

  if (!usernameInput || !usernameText || !registerSubmit) {
    return;
  }

  usernameInput.addEventListener('change', async () => {
    let data;
    try {
      data = await checkUsername(usernameInput.value);
    } catch (err) {
      data = undefined;
    }

    if (data && data.error) {
      registerSubmit.disabled = true;
      usernameText.classList.remove('text--green');
      usernameText.classList.add('text--red');
      usernameText.textContent = data.message;
      return;
    }

    registerSubmit.disabled = false;
    usernameText.classList.remove('text--red');
    usernameText.classList.add('text--green');
    usernameText.textContent = 'Username available!';
  });
}

onReady(() => initRegisterHelpers());
