import { afterEach, describe, it, expect, vi } from 'vitest';
import { UserStore } from './UserStore';
import { set, get } from '../utils/localStorage';

describe('user preferences', () => {
  afterEach(() => { delete window.INITIAL_ACCOUNT_DARK_THEME; });
  it('starts dark when no preference exists and preserves that default when a guest joins', () => {
    const store = new UserStore();
    expect(store.getState().user.settings.darkTheme).toBe(true);
    store.setUser({});
    expect(store.getState().user.settings.darkTheme).toBe(true);
  });
  it('restores an explicitly saved light guest preference before the first render', () => {
    set('darkTheme', false);
    const store = new UserStore();
    expect(store.getState().user.settings.darkTheme).toBe(false);
    store.setUser({});
    expect(store.getState().user.settings.darkTheme).toBe(false);
  });
  it('uses the rendered account appearance while awaiting full account data', () => {
    window.INITIAL_ACCOUNT_DARK_THEME = false;
    set('darkTheme', true);
    const store = new UserStore();
    store.setUser({ handle: 'Alice' });
    expect(store.getState().user.settings.darkTheme).toBe(false);
    store.setUser({ user_id: 'account' });
    expect(store.getState().user.settings.darkTheme).toBe(false);
    store.setUser({ user_id: null });
    expect(store.getState().user.settings.darkTheme).toBe(true);
  });
  it('defaults a new account to dark instead of inheriting a guest light preference', () => {
    set('darkTheme', false);
    const store = new UserStore(); store.setUser({ user_id: 'account', settings: {} });
    expect(store.getState().user.settings.darkTheme).toBe(true);
  });
  it('preserves explicit light account settings over stored guest dark settings', () => {
    set('darkTheme', true);
    const store = new UserStore(); store.setUser({ user_id: 'account', settings: { darkTheme: false } });
    store.setUser({ handle: 'Alice' });
    expect(store.getState().user.settings.darkTheme).toBe(false);
  });
  it('loads and switches theme even when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    const store = new UserStore(); store.setUser({}); store.setTheme(false);
    expect(store.getState().user.settings.darkTheme).toBe(false);
  });
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
