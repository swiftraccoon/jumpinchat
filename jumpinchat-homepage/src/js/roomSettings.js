import { onReady, sendForm } from './dom.js';

export function initRoomSettings(root = document) {
  root.querySelectorAll('.settings__RoomModRemove').forEach((button) => {
    button.addEventListener('click', async () => {
      const { username } = button.dataset;
      let response;
      try {
        response = await sendForm('/settings/moderator', 'DELETE', { username });
      } catch (err) {
        return;
      }

      if (response.ok) {
        button.parentElement.remove();
      }
    });
  });
}

onReady(() => initRoomSettings());
