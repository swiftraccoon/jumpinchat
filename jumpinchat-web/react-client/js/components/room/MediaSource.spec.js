import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MediaSource from './MediaSource.react';
vi.mock('../../utils/CamUtil', () => ({ publish: vi.fn() }));
vi.mock('../../actions/ModalActions', () => ({ setModalError: vi.fn() }));

const device = { deviceId: 'camera-1', label: 'Front camera' };
describe('media source preview', () => {
  it('acquires the selected camera, attaches its preview, and stops tracks on removal', async () => {
    const videoTrack = { stop: vi.fn() }; const audioTrack = { stop: vi.fn() };
    const stream = { getTracks: () => [videoTrack, audioTrack], getVideoTracks: () => [videoTrack], getAudioTracks: () => [audioTrack] };
    navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    const select = vi.fn(); const { container, unmount } = render(<MediaSource type="video" device={device} onSelectDevice={select} />);
    await waitFor(() => expect(container.querySelector('video').srcObject).toBe(stream));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ deviceId: { exact: 'camera-1' } }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Front camera' })); expect(select).toHaveBeenCalledWith('camera-1', 'video');
    unmount(); await waitFor(() => expect(videoTrack.stop).toHaveBeenCalledOnce()); expect(audioTrack.stop).toHaveBeenCalledOnce();
  });
  it('releases a preview that resolves after the source has unmounted', async () => {
    let resolve; const stop = vi.fn(); const stream = { getTracks: () => [{ stop }], getVideoTracks: () => [{ stop }], getAudioTracks: () => [] };
    navigator.mediaDevices.getUserMedia.mockReturnValue(new Promise(done => { resolve = done; }));
    const { unmount } = render(<MediaSource type="video" device={device} onSelectDevice={vi.fn()} />); unmount();
    await act(async () => resolve(stream)); expect(stop).toHaveBeenCalledOnce();
  });
  it('shows permission failure and keeps audio selection available without acquiring a preview', async () => {
    navigator.mediaDevices.getUserMedia.mockRejectedValue(Object.assign(new Error('Camera permission denied'), { name: 'NotAllowedError' }));
    const { rerender } = render(<MediaSource type="video" device={device} onSelectDevice={vi.fn()} />);
    expect(await screen.findByText('Camera permission denied')).toBeVisible();
    rerender(<MediaSource key="audio" type="audio" device={{ deviceId: 'mic', label: 'Microphone' }} onSelectDevice={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Microphone' })).toBeVisible(); expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
  });
});
