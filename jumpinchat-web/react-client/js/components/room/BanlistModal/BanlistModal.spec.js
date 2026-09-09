import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BanlistModal from './BanlistModal.react';
import { sendOperatorAction } from '../../../utils/RoomAPI';
vi.mock('../../../utils/RoomAPI', () => ({ sendOperatorAction: vi.fn() }));
vi.mock('../../../actions/ModalActions', () => ({ setBanlistModal: vi.fn() }));
vi.mock('./BanlistItem.react', () => ({ default: ({ item, onRemove }) => <button onClick={onRemove}>Unban {item.handle}</button> }));

describe('ban management', () => {
  it('shows active bans and submits an unban for the selected record', () => {
    const now = Date.now(); render(<BanlistModal isOpen banlist={[{ _id: 'active', handle: 'Bob', timestamp: new Date(now).toISOString() }, { _id: 'expired', handle: 'Alice', timestamp: new Date(now - 25 * 3600000).toISOString() }]} />);
    expect(screen.queryByRole('button', { name: 'Unban Alice' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Unban Bob' })); expect(sendOperatorAction).toHaveBeenCalledWith('unban', { banlistId: 'active', handle: 'Bob' });
  });
  it('explains an empty ban list', () => {
    render(<BanlistModal isOpen />); expect(screen.getByText('Banlist empty.')).toBeVisible();
  });
});
