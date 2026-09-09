import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomChat } from './RoomChat.react';
import { chatTabs } from '../../../constants/RoomConstants';
vi.mock('./RoomChatHeader.react', () => ({ default: ({ chatOpen, onToggleChat }) => <button onClick={() => onToggleChat(!chatOpen)}>Toggle chat</button> }));
vi.mock('./RoomChatFeed.react', () => ({ default: () => <div>Public feed</div> }));
vi.mock('./RoomUserList.react', () => ({ default: () => <div>Participants</div> }));
vi.mock('./privateMessages/PmWrapper.react', () => ({ default: () => <div>Private conversations</div> }));
const props = { room: { name: 'room', attrs: {} }, scroll: { fixScroll: false }, emojiSearch: { results: [] } };

describe('chat panel navigation', () => {
  it('switches between public and private feeds and retains its expansion toggle', () => {
    const { container, rerender } = render(<RoomChat {...props} chatTab={chatTabs.CHAT_FEED} />); expect(screen.getByText('Public feed')).toBeVisible(); expect(screen.getByText('Participants')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle chat' })); expect(container.querySelector('.chat')).toHaveClass('chat--open');
    rerender(<RoomChat {...props} chatTab={chatTabs.CHAT_PM} />); expect(screen.getByText('Private conversations')).toBeVisible(); expect(screen.queryByText('Public feed')).not.toBeInTheDocument();
  });
});
