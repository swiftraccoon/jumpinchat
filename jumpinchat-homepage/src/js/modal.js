import { onReady } from './dom.js';

export function initModals(root = document) {
  let modal = null;

  root.querySelectorAll('.modal-trigger').forEach((trigger) => {
    trigger.addEventListener('click', () => {
      modal = root.querySelector(`#${trigger.dataset.target}`);
      if (modal) {
        modal.classList.add('open');
      }
    });
  });

  root.querySelectorAll('.modal-btn-close').forEach((button) => {
    button.addEventListener('click', () => {
      if (modal) {
        modal.classList.remove('open');
      }
    });
  });
}

onReady(() => initModals());
