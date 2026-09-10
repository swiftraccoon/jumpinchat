import { onReady } from './dom.js';

export function initDisableOnClick(root = document) {
  root.querySelectorAll('button.disableOnClick').forEach((button) => {
    button.addEventListener('click', () => {
      // Disable after the click has submitted the form.
      setTimeout(() => {
        button.disabled = true;
      });
    });
  });
}

onReady(() => initDisableOnClick());
