import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import Modal from 'react-modal';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';

library.add(fas);

beforeEach(() => {
  document.body.innerHTML = '<div id="app-root"></div>';
  Modal.setAppElement('#app-root');
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [],
      }),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
