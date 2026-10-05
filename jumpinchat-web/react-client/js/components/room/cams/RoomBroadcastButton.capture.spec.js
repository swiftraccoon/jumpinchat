import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import RoomBroadcastButton from './RoomBroadcastButton.react';
import { checkCanBroadcast } from '../../../utils/UserAPI';
import { getMediaSelection } from '../../../utils/mediaSelectionCapture';
import modalStore from '../../../stores/ModalStore';
import { setMediaSelectionModal } from '../../../actions/ModalActions';

vi.mock('../../../utils/UserAPI', () => ({ checkCanBroadcast: vi.fn() }));
vi.mock('../../../utils/CamUtil', () => ({ unpublishOwnFeed: vi.fn() }));
vi.mock('../../../actions/CamActions', () => ({ setCanBroadcast: vi.fn() }));
vi.mock('../../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function nativeStream() {
  const tracks = ['audio', 'video'].map(kind => ({
    kind, enabled: true, readyState: 'live', getSettings: () => ({ deviceId: kind }),
    stop: vi.fn(function stop() { this.readyState = 'ended'; }),
  }));
  return { getTracks: () => tracks };
}

function start() {
  const view = render(<RoomBroadcastButton roomName="test" feedCount={1} canBroadcast />);
  fireEvent.click(screen.getByRole('button', { name: /Start Broadcasting/ }));
  return view;
}

describe('initial media selection cancellation', () => {
  beforeEach(() => {
    setMediaSelectionModal(false);
    checkCanBroadcast.mockImplementation((room, done) => done(null, true));
  });

  it('stops a late permission capture without checking authorization or reopening the cancelled dialog', async () => {
    const pending = deferred();
    const stream = nativeStream();
    navigator.mediaDevices.getUserMedia.mockReturnValue(pending.promise);
    start();
    act(() => setMediaSelectionModal(false));
    await act(async () => { pending.resolve(stream); });
    expect(stream.getTracks().every(track => track.readyState === 'ended')).toBe(true);
    expect(checkCanBroadcast).not.toHaveBeenCalled();
    expect(modalStore.getMediaSelectionModal().open).toBe(false);
    expect(getMediaSelection()).toBeNull();
  });

  it('ignores a late authorization callback after cancellation', async () => {
    let authorize;
    const stream = nativeStream();
    navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    checkCanBroadcast.mockImplementation((room, done) => { authorize = done; });
    start();
    await waitFor(() => expect(authorize).toBeDefined());
    expect(stream.getTracks()[0].enabled).toBe(false);
    act(() => setMediaSelectionModal(false));
    await act(async () => authorize(null, true));
    expect(navigator.mediaDevices.enumerateDevices).not.toHaveBeenCalled();
    expect(stream.getTracks().every(track => track.readyState === 'ended')).toBe(true);
    expect(modalStore.getMediaSelectionModal().open).toBe(false);
  });

  it('does not reopen the dialog when cancelled device enumeration finishes', async () => {
    const pending = deferred();
    const stream = nativeStream();
    navigator.mediaDevices.getUserMedia.mockResolvedValue(stream);
    navigator.mediaDevices.enumerateDevices.mockReturnValue(pending.promise);
    start();
    await waitFor(() => expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalledOnce());
    act(() => setMediaSelectionModal(false));
    await act(async () => { pending.resolve([{ kind: 'videoinput', deviceId: 'video' }]); });
    expect(stream.getTracks().every(track => track.readyState === 'ended')).toBe(true);
    expect(modalStore.getMediaSelectionModal().open).toBe(false);
    expect(modalStore.getMediaSelectionModal().deviceList.video).toEqual([]);
  });

  it('releases a late initial capture when the room unmounts', async () => {
    const pending = deferred();
    const stream = nativeStream();
    navigator.mediaDevices.getUserMedia.mockReturnValue(pending.promise);
    const view = start();
    view.unmount();
    await act(async () => { pending.resolve(stream); });
    expect(stream.getTracks().every(track => track.readyState === 'ended')).toBe(true);
    expect(checkCanBroadcast).not.toHaveBeenCalled();
    expect(getMediaSelection()).toBeNull();
  });
});
