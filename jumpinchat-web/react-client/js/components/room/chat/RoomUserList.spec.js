import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomUserList } from './RoomUserList.react';
vi.mock('./RoomUserListItem.react', () => ({ default: ({ user }) => <div role="listitem">{user.handle}</div> }));

describe('participant ordering', () => {
  it('keeps administrators first and unknown roles visible at the end', () => {
    const users = [{ _id: 'guest', handle: 'Guest', roles: ['removed'] }, { _id: 'member', handle: 'Member', roles: ['member'] }, { _id: 'admin', handle: 'Admin', roles: [], isAdmin: true }];
    render(<RoomUserList users={users} roleState={{ roles: [{ tag: 'member', order: 1 }] }} />);
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Admin', 'Member', 'Guest']);
  });
});
