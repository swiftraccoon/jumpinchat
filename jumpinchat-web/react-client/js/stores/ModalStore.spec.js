import { describe, it, expect } from 'vitest';
import { ModalStore } from './ModalStore';

describe('media selection state', () => {
  it('separates input devices and excludes output speakers', () => {
    const store = new ModalStore();
    const camera = { kind: 'videoinput', deviceId: 'cam' }; const mic = { kind: 'audioinput', deviceId: 'mic' };
    store.setDeviceList([camera, mic, { kind: 'audiooutput', deviceId: 'speaker' }]);
    expect(store.getMediaSelectionModal().deviceList).toEqual({ video: [camera], audio: [mic] });
  });
  it('retains the selected camera when choosing a microphone', () => {
    const store = new ModalStore(); store.setMediaDeviceId('cam', 'video'); store.setMediaDeviceId('mic', 'audio');
    expect(store.getMediaSelectionModal().selectedDevices).toEqual({ video: 'cam', audio: 'mic' });
  });
  it('clears a previous error when reopening the selection dialog', () => {
    const store = new ModalStore(); store.setModalError({ message: 'Denied' }); store.setMediaSelectionModal(true);
    expect(store.getModalError()).toBeNull(); expect(store.getMediaSelectionModal().open).toBe(true);
  });
});
