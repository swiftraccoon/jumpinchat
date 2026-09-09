import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PmListItem from './PmListItem.react';
import chatStore from '../../../../stores/ChatStore/ChatStore';

describe('private conversation entry', () => {
  it('shows unread count and selects the participant', () => {
    chatStore.setUsers([{ _id: 'bob', handle: 'Bob' }]); const select = vi.fn();
    render(<PmListItem user={{ userListId: 'bob' }} unreadMessages={3} selectConversation={select} openMenu={vi.fn()} handleClickOutside={vi.fn()} closeConversation={vi.fn()} />);
    expect(screen.getByText('3')).toBeVisible(); fireEvent.click(screen.getByText('Bob')); expect(select).toHaveBeenCalledWith('bob');
  });
});
