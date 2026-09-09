import { describe, it, expect } from 'vitest';
import { UserStore } from './UserStore';
import { set, get } from '../utils/localStorage';

describe('user preferences', () => {
  it('restores a guest handle and preferences across sessions', () => {
    set('handle', 'Alice'); set('darkTheme', true); set('playYtVideos', false);
    const store = new UserStore(); store.setUser({});
    expect(store.getState().user).toMatchObject({ restoredHandle: 'Alice', settings: { darkTheme: true, playYtVideos: false } });
  });
  it('preserves account preferences over guest storage', () => {
    set('darkTheme', false);
    const store = new UserStore();
    store.setUser({ user_id: 'account', settings: { darkTheme: true } });
    store.setUser({ handle: 'Alice' });
    expect(store.getState().user.settings.darkTheme).toBe(true);
  });
  it('persists guest changes and clears the restored handle after confirmation', () => {
    const store = new UserStore(); store.changeHandle({ handle: 'Alice' }); store.setTheme(true);
    expect(store.getState().user).toMatchObject({ handle: 'Alice', hasChangedHandle: true, restoredHandle: null });
    expect(get('handle')).toBe('Alice'); expect(get('darkTheme')).toBe(true);
  });
  it('does not overwrite guest preferences when an account changes theme', () => {
    const store = new UserStore(); store.setUser({ user_id: 'account' }); store.setTheme(true);
    expect(localStorage.getItem('darkTheme')).toBeNull();
  });
});
