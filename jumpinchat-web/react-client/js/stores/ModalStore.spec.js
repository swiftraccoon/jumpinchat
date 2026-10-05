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
  it('resets loading and device selection on close and starts the next attempt at video', () => {
    const store = new ModalStore();
    store.setMediaSelectionModal(true);
    store.setMediaDeviceId('cam', 'video'); store.setMediaDeviceId('mic', 'audio');
    store.setMediaSelectionModalType('audio'); store.setMediaSelectionLoading(true);
    store.setMediaSelectionModal(false);
    expect(store.getMediaSelectionModal()).toMatchObject({
      open: false, loading: false, mediaType: 'video', selectedDevices: { video: null, audio: null },
    });
    store.setMediaSelectionModal(true);
    expect(store.getMediaSelectionModal()).toMatchObject({
      open: true, loading: false, mediaType: 'video', selectedDevices: { video: null, audio: null },
    });
  });
  it('preserves an active selection when refreshing an already-open dialog', () => {
    const store = new ModalStore();
    store.setMediaSelectionModal(true);
    store.setMediaDeviceId('cam', 'video'); store.setMediaSelectionModalType('audio');
    store.setMediaSelectionModal(true);
    expect(store.getMediaSelectionModal()).toMatchObject({
      open: true, mediaType: 'audio', selectedDevices: { video: 'cam', audio: null },
    });
  });
  it('tracks the current startup phase and clears it on stop or close', () => {
    const store = new ModalStore();
    store.setMediaSelectionModal(true);
    store.setMediaSelectionLoading(true, 'Waiting for camera and microphone…');
    expect(store.getMediaSelectionModal().loadingMessage).toBe('Waiting for camera and microphone…');
    store.setMediaSelectionLoading(true, 'Preparing broadcast…');
    expect(store.getMediaSelectionModal().loadingMessage).toBe('Preparing broadcast…');
    store.setMediaSelectionLoading(false);
    expect(store.getMediaSelectionModal().loadingMessage).toBe('');
    store.setMediaSelectionLoading(true, 'Preparing broadcast…');
    store.setMediaSelectionModal(false);
    expect(store.getMediaSelectionModal().loadingMessage).toBe('');
  });
});
