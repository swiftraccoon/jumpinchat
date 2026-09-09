import { describe, it, expect, vi } from 'vitest';
import { NotificationStore } from './NotificationStore';

describe('notification lifetime', () => {
  it('expires temporary notifications and retains manual notices', () => {
    vi.useFakeTimers(); const store = new NotificationStore();
    store.addNotification({ message: 'Persistent', autoClose: false });
    store.addNotification({ message: 'Temporary', autoClose: true });
    vi.advanceTimersByTime(6000);
    expect(store.getNotifications().map(n => n.message)).toEqual(['Persistent']);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('deduplicates repeated messages', () => {
    vi.useFakeTimers(); const store = new NotificationStore();
    store.addNotification({ message: 'Disconnected', autoClose: true });
    store.addNotification({ message: 'Disconnected', autoClose: true });
    expect(store.getNotifications()).toHaveLength(1);
  });
  it('pauses expiry while the reader interacts with a notice', () => {
    vi.useFakeTimers(); const store = new NotificationStore();
    store.addNotification({ message: 'Read me', autoClose: true }); store.pauseNotificationTimer();
    vi.advanceTimersByTime(9000); expect(store.getNotifications()).toHaveLength(1);
    store.notificationsTimer(); vi.advanceTimersByTime(3000); expect(store.getNotifications()).toEqual([]);
  });
});
