import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoomChatShare from './RoomChatShare.react';
import { addNotification } from '../../../actions/NotificationActions';
vi.mock('../../../actions/NotificationActions', () => ({ addNotification: vi.fn() }));

describe('room sharing', () => {
  it('shares the room URL with the native share API', async () => {
    const share = vi.fn().mockResolvedValue(); Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<RoomChatShare roomName="friends" />); expect(screen.getByRole('textbox')).toHaveValue('jumpin.chat/friends');
    fireEvent.click(screen.getByRole('button'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://jumpin.chat/friends' }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' })));
    delete navigator.share;
  });
});
