import { describe, it, expect, vi } from 'vitest';
import Store from './Store';

describe('Zustand domain store subscriptions', () => {
  it('publishes once at the explicit change boundary and preserves media identity', () => {
    const stream = { getTracks() {} }; const store = new Store('media', { stream }); const listener = vi.fn();
    store.addChangeListener(listener); store.addChangeListener(listener);
    const before = store.getSnapshot(); store.state = { ...store.state, volume: 30 };
    expect(listener).not.toHaveBeenCalled(); store.emitChange();
    expect(listener).toHaveBeenCalledOnce(); expect(store.getSnapshot().revision).toBe(before.revision + 1); expect(store.getState().stream).toBe(stream);
  });
  it('supports both domain listeners and native Zustand unsubscribe functions', () => {
    const store = new Store('test', {}); const domain = vi.fn(); const native = vi.fn();
    const stopDomain = store.addChangeListener(domain); const stopNative = store.subscribe(native);
    store.emitChange(); stopDomain(); stopNative(); store.emitChange();
    expect(domain).toHaveBeenCalledOnce(); expect(native).toHaveBeenCalledOnce();
  });
});
