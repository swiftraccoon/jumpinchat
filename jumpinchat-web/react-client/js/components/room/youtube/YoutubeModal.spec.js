import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { YoutubeModal } from './YoutubeModal.react';
import { setYoutubeSearchModal } from '../../../actions/YoutubeActions';
import { removeVideo } from '../../../utils/YoutubeAPI';
vi.mock('../../../actions/YoutubeActions', () => ({ setYoutubeSearchModal: vi.fn() }));
vi.mock('../../../utils/YoutubeAPI', () => ({ getSearch: vi.fn(), setYoutubeVideoPlaying: vi.fn(), removeVideo: vi.fn() }));
vi.mock('./YoutubeSearchModal.react', () => ({ default: () => <input aria-label="Video search" /> }));
vi.mock('./YoutubePlaylist.react', () => ({ default: ({ list, onRemoveItem }) => <div>{list.map(video => <button key={video.id} onClick={() => onRemoveItem(video.id)}>Remove {video.title}</button>)}</div> }));

describe('video search dialog', () => {
  it('offers playlist management until search results arrive', () => {
    const props = { isOpen: true, resultsLoading: false, playlist: [{ id: 'video', title: 'Music' }] };
    const { rerender } = render(<YoutubeModal {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Remove Music' })); expect(removeVideo).toHaveBeenCalledWith('video');
    rerender(<YoutubeModal {...props} results={[{}]} />); expect(screen.queryByRole('button', { name: 'Remove Music' })).not.toBeInTheDocument();
  });
  it('dismisses the dialog with Escape', () => {
    render(<YoutubeModal isOpen resultsLoading={false} playlist={[]} />); fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 }); expect(setYoutubeSearchModal).toHaveBeenCalledWith(false);
  });
});
