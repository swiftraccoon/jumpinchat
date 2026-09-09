import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import YoutubeSearchModal from './YoutubeSearchModal.react';
import { getSearch, setYoutubeVideoPlaying } from '../../../utils/YoutubeAPI';
import { clearYoutubeSearch, setYoutubeSearchModal } from '../../../actions/YoutubeActions';
vi.mock('../../../utils/YoutubeAPI', () => ({ getSearch: vi.fn(), setYoutubeVideoPlaying: vi.fn() }));
vi.mock('../../../actions/YoutubeActions', () => ({ clearYoutubeSearch: vi.fn(), setYoutubeSearchModal: vi.fn() }));
vi.mock('./YoutubeSearchResult.react', () => ({ default: ({ result, onPlayVideo }) => <button onClick={() => onPlayVideo(result)}>Play {result.title}</button> }));

describe('video search', () => {
  it('requires a meaningful query and clears previous results when requested', () => {
    render(<YoutubeSearchModal resultsLoading={false} />); const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: ' a ' } }); fireEvent.click(screen.getByRole('button', { name: 'Search' })); expect(getSearch).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'music' } }); fireEvent.click(screen.getByRole('button', { name: 'Search' })); expect(getSearch).toHaveBeenCalledWith('music');
    fireEvent.click(screen.getByRole('button', { name: 'clear search' })); expect(input).toHaveValue(''); expect(clearYoutubeSearch).toHaveBeenCalledOnce();
  });
  it('plays the selected result and dismisses search', () => {
    render(<YoutubeSearchModal resultsLoading={false} results={[{ videoId: 'video', title: 'Music' }]} />); fireEvent.click(screen.getByRole('button', { name: 'Play Music' }));
    expect(setYoutubeVideoPlaying).toHaveBeenCalledWith('video', 'Music'); expect(setYoutubeSearchModal).toHaveBeenCalledWith(false);
  });
  it('reports search failures visibly', () => {
    render(<YoutubeSearchModal resultsLoading={false} error={{ message: 'Search unavailable' }} />); expect(screen.getByText('Search unavailable')).toBeVisible();
  });
});
