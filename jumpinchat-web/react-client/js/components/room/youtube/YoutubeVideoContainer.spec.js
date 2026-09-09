import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { YoutubeVideoContainer } from './YoutubeVideoContainer.react';
import { setYoutubeVideo } from '../../../actions/YoutubeActions';
import { checkVideoPlaying, getPlaylist } from '../../../utils/YoutubeAPI';
import { addNotification } from '../../../actions/NotificationActions';
const player = vi.hoisted(() => ({ setVolume: vi.fn(), seekTo: vi.fn(), pauseVideo: vi.fn(), playVideo: vi.fn(), getCurrentTime: vi.fn().mockReturnValue(10) }));
vi.mock('react-youtube', () => ({ default: ({ videoId, onReady, onEnd, onError }) => <div><span>{videoId}</span><button onClick={() => onReady({ target: player })}>Player ready</button><button onClick={onEnd}>Player ended</button><button onClick={() => onError({ data: 100 })}>Player error</button></div> }));
vi.mock('../../../actions/YoutubeActions', () => ({ setYoutubeVideo: vi.fn(), setYoutubeOptions: vi.fn(), setYoutubeVolume: vi.fn(), setYoutubeShowVolume: vi.fn() }));
vi.mock('../../../utils/YoutubeAPI', () => ({ pauseVideo: vi.fn(), resumeVideo: vi.fn(), checkVideoPlaying: vi.fn(), getPlaylist: vi.fn() }));
vi.mock('../../../actions/NotificationActions', () => ({ addNotification: vi.fn() }));
vi.mock('./YoutubeVideoOptions.react', () => ({ default: () => null }));
vi.mock('./YoutubeControls.react', () => ({ default: ({ currentTime }) => <output aria-label="Playback time">{currentTime}</output> }));
const props = { dimensions: { width: 640, height: 360 }, videoDetails: { mediaId: 'video', duration: 120, startAt: 5, pausedAt: '2026-09-09T00:00:00Z' }, volume: 35, userState: { user: { roles: [] } }, roleState: { roles: [] }, hasChangedHandle: true };

describe('shared player integration', () => {
  it('restores volume, seek position and pause state, then cleans its playback timer', () => {
    vi.useFakeTimers(); const ended = vi.fn(); const { unmount } = render(<YoutubeVideoContainer {...props} onVideoEnd={ended} />);
    fireEvent.click(screen.getByRole('button', { name: 'Player ready' })); expect(player.setVolume).toHaveBeenCalledWith(35); expect(player.seekTo).toHaveBeenCalledWith(5); expect(player.pauseVideo).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(1000)); expect(screen.getByLabelText('Playback time')).toHaveTextContent('10');
    unmount(); expect(ended).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('refreshes playback and playlist after the current video ends', () => {
    render(<YoutubeVideoContainer {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Player ended' }));
    expect(setYoutubeVideo).toHaveBeenCalledWith(null); expect(checkVideoPlaying).toHaveBeenCalledOnce(); expect(getPlaylist).toHaveBeenCalledOnce();
  });
  it('reports a provider error and hides the unavailable video', () => {
    render(<YoutubeVideoContainer {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Player error' }));
    expect(addNotification).toHaveBeenCalledWith(expect.objectContaining({ color: 'red', message: expect.any(String) })); expect(setYoutubeVideo).toHaveBeenCalledWith(null);
  });
});
