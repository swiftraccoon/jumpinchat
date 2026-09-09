import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PmConversationList from './PmConversationList.react';
import chatStore from '../../../../stores/ChatStore/ChatStore';

describe('private conversation list', () => {
  it('highlights the selected conversation without hiding the others', () => {
    chatStore.setUsers([{ _id: 'bob', handle: 'Bob' }, { _id: 'alice', handle: 'Alice' }]);
    render(<PmConversationList privateMessages={['bob', 'alice'].map(userListId => ({ user: { userListId }, unreadMessages: 0 }))} selectedConversation="alice" selectConversation={vi.fn()} openMenu={vi.fn()} handleClickOutside={vi.fn()} closeConversation={vi.fn()} />);
    expect(screen.getByText('Alice')).toHaveClass('userList__UserHandle-current'); expect(screen.getByText('Bob')).not.toHaveClass('userList__UserHandle-current');
  });
});
