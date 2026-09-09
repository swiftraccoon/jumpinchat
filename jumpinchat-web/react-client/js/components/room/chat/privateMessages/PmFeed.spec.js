import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PmFeed from './PmFeed.react';
import chatStore from '../../../../stores/ChatStore/ChatStore';
import { setScroll } from '../../../../actions/ChatActions';
vi.mock('../../../../actions/ChatActions', () => ({ setScroll: vi.fn(), setScrollFixed: vi.fn() }));
vi.mock('../RoomChatMessage.react', () => ({ default: ({ message }) => <p>{message.message}</p> }));
const conversation = { user: { userListId: 'bob' }, messages: [{ id: '1', message: 'Private hello' }] };
const props = { privateMessages: [conversation], onSubmit: vi.fn(), onChange: vi.fn(), onFocus: vi.fn(), fixScroll: false };
beforeEach(() => chatStore.setUsers([{ _id: 'bob', handle: 'Bob' }]));

describe('private message feed', () => {
  it('shows only the selected conversation and disables replies when it closes', () => {
    const { rerender } = render(<PmFeed {...props} />); expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    rerender(<PmFeed {...props} selectedConversation="bob" />); expect(screen.getByText('Private hello')).toBeVisible();
    expect(screen.getByPlaceholderText('Send a message to Bob')).toBeEnabled();
    rerender(<PmFeed {...props} selectedConversation="bob" privateMessages={[{ ...conversation, disabled: true }]} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
  it('uses native scroll position to pause following private messages', async () => {
    const { container } = render(<PmFeed {...props} selectedConversation="bob" />); const feed = container.querySelector('.chat__Feed');
    Object.defineProperties(feed, { scrollHeight: { configurable: true, value: 700 }, clientHeight: { configurable: true, value: 200 } });
    await waitFor(() => expect(feed.scrollTop).toBe(700));
    feed.scrollTop = 300; fireEvent.scroll(feed); expect(setScroll).toHaveBeenCalledWith(200);
  });
});
