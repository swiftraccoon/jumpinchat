import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import YoutubeVideoOptions from './YoutubeVideoOptions.react';
import { setYoutubeVideo, setYoutubeOptions } from '../../../actions/YoutubeActions';
vi.mock('../../../actions/YoutubeActions', () => ({ setYoutubeVideo: vi.fn(), setYoutubeOptions: vi.fn() }));

describe('shared video menu', () => {
  it('offers sync and hide in a dismissible portal', () => {
    const sync = vi.fn(); render(<YoutubeVideoOptions open onSync={sync} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync video' })); expect(sync).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Hide video' })); expect(setYoutubeVideo).toHaveBeenCalledWith(null);
    fireEvent.keyDown(document, { key: 'Escape' }); expect(setYoutubeOptions).toHaveBeenCalledWith(false);
  });
});
