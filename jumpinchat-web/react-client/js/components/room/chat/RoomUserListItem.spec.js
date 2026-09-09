import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomUserListItem } from './RoomUserListItem.react';
import { setHandleModal, setProfileModal } from '../../../actions/ModalActions';
import { setNewProfile } from '../../../actions/ProfileActions';
vi.mock('../../../actions/ModalActions', () => ({ setHandleModal: vi.fn(), setProfileModal: vi.fn() }));
vi.mock('../../../actions/ProfileActions', () => ({ setNewProfile: vi.fn(), setIgnoreListItem: vi.fn() }));
const user = { _id: 'bob', handle: 'Bob', roles: [], isAdmin: false, isSiteMod: false, isSupporter: false };

describe('participant selection', () => {
  it('opens another participant profile', () => {
    render(<RoomUserListItem user={user} clientUser={{ _id: 'me' }} roleState={{ roles: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(setNewProfile).toHaveBeenCalledWith(expect.objectContaining({ handle: 'Bob', userListId: 'bob' })); expect(setProfileModal).toHaveBeenCalledWith(true);
  });
  it('lets the client edit their own handle', () => {
    render(<RoomUserListItem user={user} clientUser={user} roleState={{ roles: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bob' })); expect(setHandleModal).toHaveBeenCalledWith(true);
    expect(screen.getByText('Bob')).toHaveClass('userList__UserHandle-current');
  });
});
