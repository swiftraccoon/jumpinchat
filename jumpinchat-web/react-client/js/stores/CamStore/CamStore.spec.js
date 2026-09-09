import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CamStore } from './CamStore';
import { newRemoteFeed } from '../../utils/CamUtil';
vi.mock('../../utils/CamUtil', () => ({ newRemoteFeed: vi.fn() }));
vi.mock('../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));

let store; let remote; let stream;
beforeEach(() => {
  store = new CamStore(); remote = { rfid: 'feed', hangup: vi.fn(), send: vi.fn() };
  stream = { getVideoTracks: () => [{ id: 'video' }] };
});
const addRemote = () => store.addStream({ userId: 'bob', roomId: 'room', remoteFeed: remote, stream, video: true, audio: true });

describe('camera feed lifetime', () => {
  it('hides a closed remote stream while retaining enough information to resume', () => {
    addRemote(); store.hangupStream('bob');
    expect(remote.hangup).toHaveBeenCalledOnce();
    expect(store.getState().cams[0].stream).toBeNull();
    expect(store.getState().feeds[0].userClosed).toBe(true);
    store.resumeStream('bob');
    expect(newRemoteFeed).toHaveBeenCalledWith('feed', 'room', 'bob', true);
    expect(store.getState().feeds[0].loading).toBe(true);
  });
  it('removes both feed and camera when a participant disconnects', () => {
    addRemote(); store.removeStream('feed');
    expect(store.getState().cams).toEqual([]); expect(store.getState().feeds).toEqual([]);
  });
  it('preserves the local preview when disabling remote cameras', () => {
    store.addStream({ stream, isLocal: true, audio: true }); addRemote(); store.disableAllCams();
    expect(store.getState().cams.find(c => c.userId === 'local').stream).toBe(stream);
    expect(remote.hangup).toHaveBeenCalledOnce();
  });
  it('requests the chosen receive quality and records it for rendering', () => {
    addRemote(); store.setReceiveSubstream('bob', 0);
    expect(remote.send).toHaveBeenLastCalledWith({ message: { request: 'configure', substream: 0 } });
    expect(store.getState().feeds[0].quality).toBe(0);
  });
});
