import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ProfileOptions from './Options.react';
import { ignoreUser, unignoreUser, sendOperatorAction } from '../../../utils/RoomAPI';
import { pmStartConversation } from '../../../actions/PmActions';
vi.mock('../../../utils/RoomAPI', () => ({ ignoreUser: vi.fn(), unignoreUser: vi.fn(), sendOperatorAction: vi.fn() }));
vi.mock('../../../actions/PmActions', () => ({ pmStartConversation: vi.fn() }));
vi.mock('../../../actions/ModalActions', () => ({ setReportModal: vi.fn(), setBanModal: vi.fn() }));
const props = { profile: { userListId: 'bob', userId: 'account' }, user: { roles: [], isAdmin: false, user_id: 'me' }, roles: [], closeModal: vi.fn() };

describe('profile actions', () => {
  it('starts a private conversation with both current and account identities', () => {
    render(<ProfileOptions {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Private message' })); expect(pmStartConversation).toHaveBeenCalledWith('bob', 'account'); expect(props.closeModal).toHaveBeenCalled();
  });
  it('switches between ignore and unignore', () => {
    const { rerender } = render(<ProfileOptions {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Ignore' })); expect(ignoreUser).toHaveBeenCalledWith('bob');
    rerender(<ProfileOptions {...props} ignoreListItem={{ id: 'ignore-record' }} />); fireEvent.click(screen.getByRole('button', { name: 'Unignore' })); expect(unignoreUser).toHaveBeenCalledWith('ignore-record');
  });
  it('offers moderation actions only for assigned permissions', () => {
    const { rerender } = render(<ProfileOptions {...props} />); expect(screen.queryByRole('button', { name: 'Kick' })).not.toBeInTheDocument();
    rerender(<ProfileOptions {...props} user={{ ...props.user, roles: ['mod'] }} roles={[{ tag: 'mod', permissions: { kick: true } }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kick' })); expect(sendOperatorAction).toHaveBeenCalledWith('kick', { user_list_id: 'bob' });
  });
});
