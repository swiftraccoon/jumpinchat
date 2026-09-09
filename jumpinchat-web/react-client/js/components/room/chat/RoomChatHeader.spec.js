import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomChatHeader } from './RoomChatHeader.react';
import { selectChatTab, setUserlist } from '../../../actions/ChatActions';
import { chatTabs, layouts } from '../../../constants/RoomConstants';
vi.mock('../../../actions/ChatActions', () => ({ selectChatTab: vi.fn(), setUserlist: vi.fn(), setRoomMessageSounds: vi.fn(), setSettingsMenu: vi.fn() }));
vi.mock('../RoomCamOptions.react', () => ({ default: () => null }));
vi.mock('./RoomChatShare.react', () => ({ default: () => null }));
const props = { room: { name: 'room' }, chatColors: [], playYoutubeVideos: true, chatTab: chatTabs.CHAT_FEED, onToggleChat: vi.fn(), chatOpen: true, unreadConversations: 2, feedsHighDef: true, layout: layouts.HORIZONTAL, globalVolume: 100 };

describe('chat navigation', () => {
  it('switches between public chat and private conversations and displays unread count', () => {
    render(<RoomChatHeader {...props} />); fireEvent.click(screen.getByRole('button', { name: /PMs\s+2/ })); expect(selectChatTab).toHaveBeenLastCalledWith(chatTabs.CHAT_PM);
    fireEvent.click(screen.getByRole('button', { name: 'Chat' })); expect(selectChatTab).toHaveBeenLastCalledWith(chatTabs.CHAT_FEED);
  });
  it('toggles the participant list', () => {
    const { container } = render(<RoomChatHeader {...props} showUserList />);
    fireEvent.click(container.querySelector('.chat__HeaderOption--toggleUserlist')); expect(setUserlist).toHaveBeenCalledWith(false);
  });
});
