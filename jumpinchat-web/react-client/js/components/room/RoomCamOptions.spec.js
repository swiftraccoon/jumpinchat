import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomCamOptions } from './RoomCamOptions.react';
import { hangupAllRemoteStreams, resumeAllRemoteStreams } from '../../actions/CamActions';
import { setYoutubeSearchModal } from '../../actions/YoutubeActions';
vi.mock('../../actions/CamActions', () => ({ hangupAllRemoteStreams: vi.fn(), resumeAllRemoteStreams: vi.fn(), toggleMuteAllRemoteStreams: vi.fn(), setGlobalStreamVolume: vi.fn() }));
vi.mock('../../actions/YoutubeActions', () => ({ setYoutubeSearchModal: vi.fn() }));
vi.mock('./chat/RoomChatSettingsMenu.react', () => ({ default: () => null }));
vi.mock('./cams/RoomCamsAudioControl.react', () => ({ default: () => null }));
const props = { user: { roles: ['member'], settings: {} }, roleState: { roles: [{ tag: 'member', permissions: { playMedia: true } }] }, roomName: 'room', feedsCount: 2, roomHasOwner: true };

describe('room-wide media controls', () => {
  it('requires both ownership and role permission to offer shared videos', () => {
    const { rerender } = render(<RoomCamOptions {...props} roomHasOwner={false} />); expect(screen.queryByRole('button', { name: /Play videos/ })).not.toBeInTheDocument();
    rerender(<RoomCamOptions {...props} />); fireEvent.click(screen.getByRole('button', { name: /Play videos/ })); expect(setYoutubeSearchModal).toHaveBeenCalledWith(true);
  });
  it('hides and resumes all remote cameras', () => {
    const { rerender } = render(<RoomCamOptions {...props} camsDisabled={false} />); fireEvent.click(screen.getByRole('button', { name: /Hide cams/ })); expect(hangupAllRemoteStreams).toHaveBeenCalledOnce();
    rerender(<RoomCamOptions {...props} camsDisabled />); fireEvent.click(screen.getByRole('button', { name: /Resume cams/ })); expect(resumeAllRemoteStreams).toHaveBeenCalledOnce();
  });
});
