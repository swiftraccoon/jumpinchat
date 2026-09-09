import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoomChatFeed from './RoomChatFeed.react';
import { setScroll, setScrollFixed } from '../../../actions/ChatActions';
vi.mock('../../../actions/ChatActions', () => ({ setScroll: vi.fn(), setScrollFixed: vi.fn() }));
vi.mock('./RoomChatInput.react', () => ({ default: () => <input aria-label="Chat message" /> }));
vi.mock('./RoomChatMessage.react', () => ({ default: ({ message }) => <p>{message.message}</p> }));
const props = { roomName: 'room', users: [], messages: [{ id: '1', message: 'First message' }], fixScroll: false, emojiPickerOpen: false, emojiSearch: { results: [], selected: 0 }, customEmoji: [] };

describe('chat feed scrolling', () => {
  it('follows messages at the bottom, preserves reading position, and resumes on request', async () => {
    const { container, rerender } = render(<RoomChatFeed {...props} />); const feed = container.querySelector('.chat__Feed');
    Object.defineProperties(feed, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } });
    await waitFor(() => expect(feed.scrollTop).toBe(1000));
    feed.scrollTop = 250; fireEvent.scroll(feed); expect(setScroll).toHaveBeenLastCalledWith(550);
    rerender(<RoomChatFeed {...props} fixScroll messages={[...props.messages, { id: '2', message: 'New message' }]} />);
    expect(screen.getByText('New message')).toBeVisible(); expect(feed.scrollTop).toBe(250);
    fireEvent.click(screen.getByRole('button', { name: 'Resume scrolling' }));
    expect(setScrollFixed).toHaveBeenCalledWith(false); expect(feed.scrollTop).toBe(1000);
  });
  it('retains the input while an empty feed receives its first message', () => {
    const { rerender } = render(<RoomChatFeed {...props} messages={[]} />);
    expect(screen.getByRole('textbox', { name: 'Chat message' })).toBeVisible();
    rerender(<RoomChatFeed {...props} />); expect(screen.getByText('First message')).toBeVisible();
  });
});
