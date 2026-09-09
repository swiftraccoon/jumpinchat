import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatStore } from './ChatStore';
import { chatTabs } from '../../constants/RoomConstants';

let store;
beforeEach(() => {
  vi.useFakeTimers(); store = new ChatStore();
  store.setClientUser({ _id: 'me', handle: 'Alice', username: 'alice', roles: [] });
  document.body.insertAdjacentHTML('beforeend', '<audio id="notification-sound"></audio><audio id="mention-sound"></audio>');
});

describe('chat state behavior', () => {
  it('keeps the latest 100 messages in order', () => {
    store.setMessageSounds(false);
    for (let index = 0; index < 105; index += 1) store.addMessage({ id: index, message: `Message ${index}`, userId: 'other' });
    expect(store.getState().messages).toHaveLength(100);
    expect(store.getState().messages[0].id).toBe(5); expect(store.getState().messages.at(-1).id).toBe(104);
  });
  it('ignores blocked senders without increasing unread counts', () => {
    store.updateIgnoreList([{ userListId: 'other' }]); store.setWindowIsVisible(false);
    store.addMessage({ id: 'ignored', message: 'Hello', userId: 'other' });
    expect(store.getState().messages).toEqual([]); expect(store.getState().unreadMessages).toBe(0);
  });
  it('counts messages received out of view and clears the count when the feed returns', () => {
    store.setMessageSounds(false); store.setWindowIsVisible(false);
    store.addMessage({ id: 'new', message: 'Hello', userId: 'other' });
    expect(store.getState().unreadMessages).toBe(1);
    store.selectChatTab(chatTabs.CHAT_FEED); store.setWindowIsVisible(true);
    expect(store.getState().unreadMessages).toBe(0);
  });
  it('uses the mention sound and recovers when autoplay is denied', async () => {
    const sound = document.getElementById('mention-sound'); vi.spyOn(sound, 'play').mockRejectedValue(new Error('Autoplay denied'));
    await store.addMessage({ id: 'mention', message: '@Alice: hello', userId: 'other' });
    expect(sound.play).toHaveBeenCalledOnce(); expect(store.getState().donePlayingNotification).toBe(true);
  });
  it('restores recent sent messages and bounds history to five', () => {
    for (const message of ['one', 'two', 'three', 'four', 'five', 'six']) store.saveClientMessage(message);
    store.selectPrevMessage(true); expect(store.getState().chatInputValue).toBe('six');
    store.selectPrevMessage(true); expect(store.getState().chatInputValue).toBe('five');
    store.selectPrevMessage(false); expect(store.getState().chatInputValue).toBe('six');
    expect(store.getState().sentMessages).toHaveLength(5);
  });
  it('preserves a departed handle and follows handle changes', () => {
    store.addUser({ _id: 'other', handle: 'Bob' }); store.changeUserHandle({ userId: 'other', handle: 'Robert' });
    store.removeUser({ _id: 'other' }); expect(store.getHandleByUserId('other')).toBe('Robert');
  });
  it('pauses following at 50 pixels and resumes near the bottom', () => {
    store.setScroll(50); expect(store.getState().scroll.fixScroll).toBe(true);
    store.setScroll(49); expect(store.getState().scroll.fixScroll).toBe(false);
  });
});
