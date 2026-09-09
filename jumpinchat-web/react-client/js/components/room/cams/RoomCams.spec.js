import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomCams } from './RoomCams.react';
vi.mock('./RoomCamsHeader.react', () => ({ default: () => null }));
vi.mock('./RoomCamsFooter.react', () => ({ default: () => null }));
vi.mock('../youtube/YoutubeVideoContainer.react', () => ({ default: () => <div>Shared video</div> }));
vi.mock('./RoomCam.react', () => ({ default: ({ streamData, dimensions }) => <div aria-label={streamData.userId} style={{ width: dimensions?.width }}>{streamData.userId}</div> }));
const props = { room: { name: 'room', attrs: {}, settings: {} }, user: { settings: { playYtVideos: true } }, users: [], layout: 'vertical', feeds: [{ userId: 'bob', remoteFeed: { rfid: 'feed' } }], cams: [{ userId: 'bob', stream: {} }] };

describe('camera layout', () => {
  it('measures the native container on resize and sizes participant tiles', async () => {
    const { container } = render(<RoomCams {...props} />);
    Object.defineProperty(container.querySelector('.cams__ContainerInternal'), 'offsetHeight', { value: 400 });
    Object.defineProperty(container.querySelector('.cams__Wrapper'), 'offsetWidth', { value: 800 }); fireEvent(window, new Event('resize'));
    await waitFor(() => expect(screen.getByLabelText('bob').style.width).not.toBe(''));
  });
  it('respects the user preference for shared video playback', () => {
    const { rerender } = render(<RoomCams {...props} currentlyPlaying={{ mediaId: 'video' }} />); expect(screen.getByText('Shared video')).toBeVisible();
    rerender(<RoomCams {...props} currentlyPlaying={{ mediaId: 'video' }} user={{ settings: { playYtVideos: false } }} />); expect(screen.queryByText('Shared video')).not.toBeInTheDocument();
  });
});
