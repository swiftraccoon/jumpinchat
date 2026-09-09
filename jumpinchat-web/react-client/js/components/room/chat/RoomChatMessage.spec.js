import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomChatMessage } from './RoomChatMessage.react';
import { setChatInputValue } from '../../../actions/ChatActions';
vi.mock('../../../actions/ChatActions', () => ({ setChatInputValue: vi.fn() }));
const userState = { user: { roles: [] } };
const message = { id: '1', handle: 'Bob', message: 'Visit https://example.com', timestamp: '2026-09-09T12:00:00Z' };

describe('chat message rendering', () => {
  it('renders safe links and mentions a sender when their handle is selected', () => {
    render(<RoomChatMessage message={message} userState={userState} />);
    const link = screen.getByRole('link', { name: 'https://example.com' }); expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('link', { name: 'Bob' })); expect(setChatInputValue).toHaveBeenCalledWith('@Bob: ');
  });
  it('highlights a mention and prioritizes the admin badge', () => {
    render(<RoomChatMessage message={{ ...message, message: '@Alice: hi', isAdmin: true, isSiteMod: true }} handle="Alice" userState={userState} />);
    expect(screen.getByText('@Alice: hi').closest('.chat__MessageBody')).toHaveClass('chat__MessageBody-userHighlight');
    expect(screen.getByText('admin')).toBeVisible(); expect(screen.queryByText('site mod')).not.toBeInTheDocument();
  });
  it('renders status text without interpreting HTML as markup', () => {
    render(<RoomChatMessage message={{ ...message, message: '<b>Disconnected</b>', status: true, error: true }} userState={userState} />);
    expect(screen.getByText('<b>Disconnected</b>')).toHaveClass('chat__MessageBody-error');
  });
});
