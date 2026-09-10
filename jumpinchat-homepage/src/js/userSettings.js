import { onReady, sendForm } from './dom.js';

export function initUserSettings(root = document) {
  root.querySelectorAll('.settings__UserIgnoreRemove').forEach((button) => {
    button.addEventListener('click', async () => {
      const { id, username } = button.dataset;
      let response;
      try {
        response = await sendForm('/settings/ignore', 'DELETE', { id, username });
      } catch (err) {
        return;
      }

      if (response.ok) {
        button.parentElement.remove();
      }
    });
  });
}

onReady(() => initUserSettings());
