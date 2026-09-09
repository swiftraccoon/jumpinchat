import { describe, it, expect, vi } from 'vitest';
import { AppDispatcher } from './AppDispatcher';

describe('Zustand action delivery', () => {
  it('finishes the current action before delivering nested actions in order', () => {
    const dispatcher = new AppDispatcher(); const received = [];
    dispatcher.register(({ action }) => {
      received.push(`first:${action.actionType}`);
      if (action.actionType === 'outer') dispatcher.handleAction({ actionType: 'inner' });
    });
    dispatcher.register(({ action }) => received.push(`second:${action.actionType}`));
    dispatcher.handleAction({ actionType: 'outer' });
    expect(received).toEqual(['first:outer', 'second:outer', 'first:inner', 'second:inner']);
    expect(dispatcher.isDispatching()).toBe(false);
  });
  it('stops delivering actions to an unsubscribed listener', () => {
    const dispatcher = new AppDispatcher(); const listener = vi.fn(); const token = dispatcher.register(listener);
    dispatcher.handleAction({ actionType: 'first' }); dispatcher.unregister(token); dispatcher.handleAction({ actionType: 'second' });
    expect(listener).toHaveBeenCalledOnce();
  });
  it('recovers for the next action after a subscriber throws', () => {
    const dispatcher = new AppDispatcher(); const received = [];
    const token = dispatcher.register(() => {
      dispatcher.handleAction({ actionType: 'stale' }); throw new Error('Subscriber failed');
    });
    expect(() => dispatcher.handleAction({ actionType: 'failed' })).toThrow('Subscriber failed'); expect(dispatcher.isDispatching()).toBe(false);
    dispatcher.unregister(token); dispatcher.register(({ action }) => received.push(action.actionType)); dispatcher.handleAction({ actionType: 'recovered' });
    expect(received).toEqual(['recovered']);
  });
});
