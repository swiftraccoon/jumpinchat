import { describe, it, expect } from 'vitest';
import { YoutubeStore } from './YoutubeStore';

describe('shared video state', () => {
  it('keeps search results separate from the currently playing video', () => {
    const store = new YoutubeStore(); store.setCurrentlyPlaying({ mediaId: 'playing' }); store.setSearchResults([{ mediaId: 'found' }]);
    expect(store.getState().currentlyPlaying).toEqual({ mediaId: 'playing' });
    expect(store.getState().searchResults).toEqual([{ mediaId: 'found' }]);
  });
  it('persists playback volume when a video closes', () => {
    const store = new YoutubeStore(); store.setVolume(45); store.setCurrentlyPlaying(null);
    expect(store.getState().volume).toBe(45); expect(store.getState().currentlyPlaying).toBeNull();
  });
});
