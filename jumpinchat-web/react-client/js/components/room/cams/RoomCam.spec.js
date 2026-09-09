import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomCam } from './RoomCam.react';
import chatStore from '../../../stores/ChatStore/ChatStore';
import { setReportModal } from '../../../actions/ModalActions';
import hark from 'hark';
vi.mock('hark', () => ({ default: vi.fn() }));
vi.mock('../../../actions/CamActions', () => ({ setStreamOptionsState: vi.fn(), setFeedAudioActive: vi.fn() }));
vi.mock('../../../actions/ModalActions', () => ({ setReportModal: vi.fn() }));
vi.mock('./RoomCamAudioActions.react', () => ({ default: () => null }));
vi.mock('./RoomCamOptions.react', () => ({ default: () => null }));
function fixtures() {
  const track = { enabled: true }; const stream = { getAudioTracks: () => [track] }; const detector = { on: vi.fn(), stop: vi.fn() }; hark.mockReturnValue(detector);
  chatStore.setUsers([{ _id: 'bob', handle: 'Bob' }]);
  return { track, stream, detector, props: { streamData: { stream, userId: 'bob', token: 'token' }, feed: { userId: 'bob', volume: 50, video: true, remoteFeed: { rfid: 'feed' } }, user: { _id: 'me', roles: [], hasChangedHandle: true }, users: [{ _id: 'bob', handle: 'Bob' }], dimensions: { width: 320, height: 240, x: 1 }, videoEnabled: true } };
}

describe('camera rendering and media lifetime', () => {
  it('attaches the stream and updates mute/volume when the feed changes', () => {
    const { props, stream, track, detector } = fixtures(); const { container, rerender, unmount } = render(<RoomCam {...props} />);
    const video = container.querySelector('video'); expect(video.srcObject).toBe(stream); expect(screen.getByText('Bob')).toBeVisible();
    rerender(<RoomCam {...props} feed={{ ...props.feed, volume: 0 }} />); expect(video.volume).toBe(0); expect(track.enabled).toBe(false);
    unmount(); expect(detector.stop).toHaveBeenCalledOnce();
  });
  it('reports the selected broadcaster and requests fullscreen on its video', () => {
    const { props } = fixtures(); const { container } = render(<RoomCam {...props} />); const fullscreen = vi.fn(); container.querySelector('video').requestFullscreen = fullscreen;
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' })); expect(fullscreen).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Report user' })); expect(setReportModal).toHaveBeenCalledWith(true, 'bob');
  });
  it('attaches a stream once its camera becomes measurable', () => {
    const { props, stream } = fixtures(); const { container, rerender } = render(<RoomCam {...props} dimensions={null} />); expect(container.querySelector('video')).toBeNull();
    rerender(<RoomCam {...props} />); expect(container.querySelector('video').srcObject).toBe(stream);
  });
});
