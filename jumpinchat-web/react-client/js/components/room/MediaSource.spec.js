import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import MediaSource from './MediaSource.react';
import { getMediaSelection, getSelectionPreview, isMediaSelectionCurrent, releaseSelectionPreview, retainSelectionStream } from '../../utils/mediaSelectionCapture';
vi.mock('../../utils/CamUtil', () => ({ publish: vi.fn() }));
vi.mock('../../actions/ModalActions', () => ({ setModalError: vi.fn() }));
vi.mock('../../utils/mediaSelectionCapture', () => ({ getMediaSelection: vi.fn(), getSelectionPreview: vi.fn(), isMediaSelectionCurrent: vi.fn(), releaseSelectionPreview: vi.fn(), retainSelectionStream: vi.fn() }));

const device = { deviceId: 'camera-1', label: 'Front camera' };
describe('media source preview', () => {
  beforeEach(() => {
    getMediaSelection.mockReturnValue(null);
    getSelectionPreview.mockResolvedValue(null);
    isMediaSelectionCurrent.mockReturnValue(true);
  });
  it('uses a retained video-only preview without reopening the device and delegates release to its owner', async () => {
    const token = {}; const videoTrack = { kind: 'video', stop: vi.fn() };
    const stream = { getTracks: () => [videoTrack], getVideoTracks: () => [videoTrack], getAudioTracks: () => [] };
    getMediaSelection.mockReturnValue(token); getSelectionPreview.mockResolvedValue(stream);
    navigator.mediaDevices.getUserMedia.mockRejectedValue(new Error('device reopening is forbidden'));
    const { container, unmount } = render(<MediaSource type="video" device={device} onSelectDevice={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('video').srcObject).toBe(stream));
    expect(container.querySelector('video').muted).toBe(true);
    expect(getSelectionPreview).toHaveBeenCalledWith(token, 'camera-1', expect.objectContaining({ width: 320, height: 240 }));
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    unmount();
    expect(releaseSelectionPreview).toHaveBeenCalledWith(token, stream);
    expect(videoTrack.stop).not.toHaveBeenCalled();
  });
  it('disables an uncached camera until its pending preview has a live video track', async () => {
    const token = {}; const select = vi.fn(); let resolveCapture;
    const videoTrack = { kind: 'video', readyState: 'live', stop: vi.fn() };
    const stream = { getTracks: () => [videoTrack], getVideoTracks: () => [videoTrack], getAudioTracks: () => [] };
    getMediaSelection.mockReturnValue(token);
    getSelectionPreview.mockResolvedValueOnce(null).mockResolvedValue(stream);
    retainSelectionStream.mockReturnValue(true);
    navigator.mediaDevices.getUserMedia.mockReturnValue(new Promise(resolve => { resolveCapture = resolve; }));
    const { container, unmount } = render(<MediaSource type="video" device={device} onSelectDevice={select} />);
    const button = screen.getByRole('button', { name: 'Front camera' });
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(select).not.toHaveBeenCalled();
    await act(async () => resolveCapture(stream));
    expect(container.querySelector('video').srcObject).toBe(stream);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(select).toHaveBeenCalledWith('camera-1', 'video');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(retainSelectionStream).toHaveBeenCalledWith(token, stream, expect.objectContaining({ audio: false }));
    unmount();
    expect(releaseSelectionPreview).toHaveBeenCalledWith(token, stream);
  });
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
