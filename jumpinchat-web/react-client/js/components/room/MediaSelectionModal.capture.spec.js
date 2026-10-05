import React, { useSyncExternalStore } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import MediaSelectionModal from './MediaSelectionModal.react';
import modalStore from '../../stores/ModalStore';
import { setMediaSelectionModal, setMediaSelectionModalLoading } from '../../actions/ModalActions';
import { publish, cancelPublish } from '../../utils/CamUtil';

vi.mock('../../utils/CamUtil', () => ({ publish: vi.fn(), cancelPublish: vi.fn() }));
vi.mock('../../actions/CamActions', () => ({ setClientAudioPtt: vi.fn(), setDefaultAudioPtt: vi.fn() }));
vi.mock('../../utils/UserAPI', () => ({ saveBroadcastQuality: vi.fn() }));
vi.mock('../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));

const devices = [
  { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
  { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
];

function Dialog({ audioPtt = false }) {
  useSyncExternalStore(modalStore.subscribe, modalStore.getSnapshot);
  return <MediaSelectionModal modal={modalStore.getMediaSelectionModal()} audioPtt={audioPtt} forcePtt={false} />;
}

describe('media selection capture lifecycle', () => {
  let stopPreview;
  beforeEach(() => {
    setMediaSelectionModal(false);
    stopPreview = vi.fn();
    navigator.mediaDevices.getUserMedia.mockImplementation(async () => ({
      getTracks: () => [{ stop: stopPreview }],
    }));
  });

  async function chooseCamera() {
    await waitFor(() => expect(document.querySelector('.mediaSources__SourceWrapper video').srcObject).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    expect(screen.getByRole('button', { name: 'Microphone' })).toBeVisible();
  }

  it.each([false, true])('does not reacquire a preview while publishing with PTT=%s and permits same-device retry', async (audioPtt) => {
    render(<Dialog audioPtt={audioPtt} />);
    act(() => setMediaSelectionModal(true, devices));
    await chooseCamera();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(stopPreview).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Microphone' }));
    expect(publish).toHaveBeenCalledExactlyOnceWith(false, null, 'cam', 'mic', !audioPtt);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(modalStore.getMediaSelectionModal()).toMatchObject({ loading: true, mediaType: 'audio' });

    // Both publication success and its error handler close the dialog this way.
    act(() => setMediaSelectionModal(false));
    expect(cancelPublish).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(modalStore.getMediaSelectionModal().selectedDevices).toEqual({ video: null, audio: null });
    act(() => setMediaSelectionModal(true, devices));
    await chooseCamera();
    expect(publish).toHaveBeenCalledOnce();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Microphone' }));
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenLastCalledWith(false, null, 'cam', 'mic', !audioPtt);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('closes from the microphone step without mounting another preview', async () => {
    render(<Dialog />);
    act(() => setMediaSelectionModal(true, devices));
    await chooseCamera();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(stopPreview).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    expect(cancelPublish).toHaveBeenCalledOnce();
    expect(modalStore.getMediaSelectionModal()).toMatchObject({
      loading: false, mediaType: 'video', selectedDevices: { video: null, audio: null },
    });
  });

  it('updates startup progress without recapturing and cancels an in-flight publish', async () => {
    render(<Dialog />);
    act(() => setMediaSelectionModal(true, devices));
    await chooseCamera();
    fireEvent.click(screen.getByRole('button', { name: 'Microphone' }));
    act(() => setMediaSelectionModalLoading(true, 'Waiting for camera and microphone…'));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for camera and microphone…');
    act(() => setMediaSelectionModalLoading(true, 'Preparing broadcast…'));
    expect(screen.getByRole('status')).toHaveTextContent('Preparing broadcast…');
    expect(publish).toHaveBeenCalledOnce();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel media selection' }));
    expect(cancelPublish).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(modalStore.getMediaSelectionModal().loadingMessage).toBe('');
  });
});
