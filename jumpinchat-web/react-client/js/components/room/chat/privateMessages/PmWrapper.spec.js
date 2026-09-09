import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PmWrapper from './PmWrapper.react';
import chatStore from '../../../../stores/ChatStore/ChatStore';
import { sendPrivateMessage } from '../../../../utils/RoomAPI';
import { setChatInputValue } from '../../../../actions/ChatActions';
import { setConversationRead } from '../../../../actions/PmActions';
vi.mock('../../../../utils/RoomAPI', () => ({ sendPrivateMessage: vi.fn() }));
vi.mock('../../../../actions/ChatActions', () => ({ setChatInputValue: vi.fn(), setScroll: vi.fn(), setScrollFixed: vi.fn() }));
vi.mock('../../../../actions/PmActions', () => ({ setConversationRead: vi.fn(), pmSelectConversation: vi.fn(), openMenu: vi.fn(), closeConversation: vi.fn() }));
const props = { roomName: 'room', fixScroll: false, selectedConversation: 'bob', privateMessages: [{ user: { userListId: 'bob' }, messages: [], unreadMessages: 1 }] };
beforeEach(() => chatStore.setUsers([{ _id: 'bob', handle: 'Bob' }]));

describe('private message interactions', () => {
  it('sends to the selected participant and clears the input', () => {
    render(<PmWrapper {...props} chatInputValue="Hello Bob" />); const input = screen.getByRole('textbox');
    fireEvent.submit(input.closest('form')); expect(sendPrivateMessage).toHaveBeenCalledWith('Hello Bob', 'room', 'bob');
    expect(setChatInputValue).toHaveBeenCalledWith('');
  });
  it('marks the conversation read on focus and ignores an empty submission', () => {
    render(<PmWrapper {...props} />); const input = screen.getByRole('textbox'); fireEvent.focus(input);
    expect(setConversationRead).toHaveBeenCalledWith('bob'); fireEvent.submit(input.closest('form')); expect(sendPrivateMessage).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Draft' } }); expect(setChatInputValue).toHaveBeenCalledWith('Draft');
  });
  it('explains the empty state', () => {
    render(<PmWrapper {...props} privateMessages={[]} />); expect(screen.getByText('No conversations yet')).toBeVisible();
  });
});
