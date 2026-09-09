import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoomCamAudioActions from './RoomCamAudioActions.react';
import { setRemoteFeedVolume, toggleMuteRemoteStream } from '../../../actions/CamActions';
vi.mock('../../../actions/CamActions', () => ({ setRemoteFeedVolume: vi.fn(), toggleMuteRemoteStream: vi.fn(), setFeedVolumeSlider: vi.fn() }));
const feed = { remoteFeed: { rfid: 'feed' }, userId: 'bob', volume: 50, showVolume: true };

describe('remote audio control', () => {
  it('applies volume to the selected feed and toggles mute only across zero', () => {
    const { rerender } = render(<RoomCamAudioActions feed={feed} volume={50} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '40' } }); expect(setRemoteFeedVolume).toHaveBeenCalledWith('feed', 40); expect(toggleMuteRemoteStream).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } }); expect(toggleMuteRemoteStream).toHaveBeenCalledWith('bob');
    rerender(<RoomCamAudioActions feed={{ ...feed, volume: 0 }} volume={0} />); fireEvent.change(screen.getByRole('slider'), { target: { value: '25' } }); expect(toggleMuteRemoteStream).toHaveBeenCalledTimes(2);
  });
  it('does not offer remote controls on the local stream', () => {
    render(<RoomCamAudioActions feed={feed} isLocalStream />); expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
