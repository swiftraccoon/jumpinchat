import { describe, it, expect, vi, afterEach } from 'vitest';
import { escapeRegExp, setPath, debounce } from './lang';

describe('escapeRegExp', () => {
  it('escapes metacharacters so the text matches literally', () => {
    expect(escapeRegExp('a.b*c?')).toBe('a\\.b\\*c\\?');
    expect(new RegExp(`@(${escapeRegExp('cool (guy)')})`).test('hi @cool (guy)')).toBe(true);
  });
});

describe('setPath', () => {
  it('sets nested values along a dotted path, creating objects', () => {
    expect(setPath({}, 'room.description', 'too long')).toEqual({ room: { description: 'too long' } });
  });

  it('keeps sibling values and accepts array paths', () => {
    const state = { room: { name: 'x' } };
    expect(setPath(state, ['room', 'topic'], 'y')).toBe(state);
    expect(state).toEqual({ room: { name: 'x', topic: 'y' } });
  });

  it('creates arrays for numeric segments and ignores nullish targets', () => {
    expect(setPath({}, 'list.0', 'a')).toEqual({ list: ['a'] });
    expect(setPath(undefined, 'a.b', 1)).toBeUndefined();
  });
});

describe('debounce', () => {
  afterEach(() => vi.useRealTimers());

  it('invokes once after the wait with the latest arguments', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 250);
    debounced('a'); debounced('b'); debounced('c');
    vi.advanceTimersByTime(249);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('honours maxWait while calls keep arriving', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 250, { maxWait: 1000 });
    // Calls every 200ms for two seconds: maxWait forces runs at 1000ms and 2000ms.
    for (let i = 0; i < 10; i += 1) { debounced(i); vi.advanceTimersByTime(200); }
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 4);
    expect(fn).toHaveBeenLastCalledWith(9);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('supports cancel and flush', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(1); debounced.cancel(); vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    debounced(2); debounced.flush();
    expect(fn).toHaveBeenCalledWith(2);
  });
});
