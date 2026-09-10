import { describe, it, expect } from 'vitest';
import classNames from './classNames';

describe('classNames', () => {
  it('joins strings and skips falsy values', () => {
    expect(classNames('button', null, undefined, false, '', 'button--blue', 0)).toBe('button button--blue');
  });

  it('includes object keys whose values are truthy', () => {
    expect(classNames('chat__Feed', { 'chat__Feed--open': true, 'chat__Feed--hidden': false })).toBe('chat__Feed chat__Feed--open');
  });

  it('flattens nested arrays', () => {
    expect(classNames(['a', ['b', { c: true, d: null }]], 3)).toBe('a b c 3');
  });

  it('returns an empty string without arguments', () => {
    expect(classNames()).toBe('');
  });
});
