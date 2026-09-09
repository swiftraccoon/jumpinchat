import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoomBroadcastButton from './RoomBroadcastButton.react';
import { checkCanBroadcast } from '../../../utils/UserAPI';
import { unpublishOwnFeed } from '../../../utils/CamUtil';
import { setMediaSelectionModal, setMediaSelectionModalLoading } from '../../../actions/ModalActions';
import { setCanBroadcast } from '../../../actions/CamActions';
vi.mock('../../../utils/UserAPI', () => ({ checkCanBroadcast: vi.fn() }));
vi.mock('../../../utils/CamUtil', () => ({ unpublishOwnFeed: vi.fn() }));
vi.mock('../../../actions/ModalActions', () => ({ setMediaSelectionModal: vi.fn(), setMediaSelectionModalLoading: vi.fn(), setModalError: vi.fn() }));
vi.mock('../../../actions/CamActions', () => ({ setCanBroadcast: vi.fn() }));

describe('broadcast controls', () => {
  it('releases the permission probe and offers deduplicated devices', async () => {
    const stop = vi.fn(); navigator.mediaDevices.getUserMedia.mockResolvedValue({ getAudioTracks: () => [], getVideoTracks: () => [{ stop }] });
    const device = { deviceId: 'cam', kind: 'videoinput' }; navigator.mediaDevices.enumerateDevices.mockResolvedValue([device, device]);
    checkCanBroadcast.mockImplementation((room, done) => done(null, true));
    render(<RoomBroadcastButton roomName="room" feedCount={1} canBroadcast />); fireEvent.click(screen.getByRole('button', { name: /Start Broadcasting/ }));
    await waitFor(() => expect(setMediaSelectionModal).toHaveBeenLastCalledWith(true, [device])); expect(stop).toHaveBeenCalledOnce(); expect(setMediaSelectionModalLoading).toHaveBeenLastCalledWith(false);
  });
  it('closes selection when broadcast permission is rejected', async () => {
    checkCanBroadcast.mockImplementation((room, done) => done(null, false)); render(<RoomBroadcastButton roomName="room" feedCount={1} canBroadcast />);
    fireEvent.click(screen.getByRole('button', { name: /Start Broadcasting/ })); await waitFor(() => expect(setMediaSelectionModal).toHaveBeenLastCalledWith(false));
  });
  it('stops broadcasting and allows another attempt after the cooldown', () => {
    vi.useFakeTimers(); render(<RoomBroadcastButton roomName="room" feedCount={1} canBroadcast localStream={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /Stop Broadcasting/ })); expect(unpublishOwnFeed).toHaveBeenCalledOnce(); expect(setCanBroadcast).toHaveBeenLastCalledWith(false);
    act(() => vi.advanceTimersByTime(2000)); expect(setCanBroadcast).toHaveBeenLastCalledWith(true);
  });
  it('disables starting when broadcast slots are full', () => {
    render(<RoomBroadcastButton roomName="room" feedCount={12} canBroadcast />); expect(screen.getByRole('button', { name: /Broadcast Slots Full/ })).toBeDisabled();
  });
});
