import { describe, it, expect, beforeEach } from 'vitest';
import { PmStore } from './PmStore';
import chatStore from '../ChatStore/ChatStore';
import userStore from '../UserStore';

let store;
beforeEach(() => {
  store = new PmStore(); chatStore.updateIgnoreList([]); chatStore.setMessageSounds(false);
  chatStore.setUsers([{ _id: 'bob', handle: 'Bob' }]); userStore.setUser({ _id: 'me' });
});

describe('private conversations', () => {
  it('creates a conversation and counts unread incoming messages', () => {
    store.addPrivateMessage({ userListId: 'bob', id: '1', message: 'Hi' });
    store.addPrivateMessage({ userListId: 'bob', id: '2', message: 'Again' });
    expect(store.getConversation('bob').map(m => m.message)).toEqual(['Hi', 'Again']);
    expect(store.getState().unreadConversations).toBe(1);
    expect(store.getState().privateMessages[0].unreadMessages).toBe(2);
    store.setPmActiveConversation('bob'); expect(store.getState().unreadConversations).toBe(0);
  });
  it('does not start a conversation with an ignored sender', () => {
    chatStore.updateIgnoreList([{ userListId: 'bob' }]);
    store.addPrivateMessage({ userListId: 'bob', id: '1', message: 'Hi' });
    expect(store.getState().privateMessages).toEqual([]);
  });
  it('resumes a registered participant after their socket identity changes', () => {
    store.setPmActiveConversation('bob', 'account'); store.disableConversation('bob');
    store.setPmActiveConversation('new-bob', 'account');
    expect(store.getState().privateMessages).toHaveLength(1);
    expect(store.getState().privateMessages[0]).toMatchObject({ disabled: false, user: { userListId: 'new-bob', userId: 'account' } });
    expect(store.getConversation('new-bob').at(-1).message).toBe('Conversation resumed');
  });
  it('closes only the requested conversation', () => {
    store.setPmActiveConversation('bob'); store.setPmActiveConversation('alice'); store.removeConversation('bob');
    expect(store.getState().privateMessages.map(c => c.user.userListId)).toEqual(['alice']);
  });
});
