import { describe, it, expect } from 'vitest';
import { set, get } from './localStorage';

describe('browser preferences', () => {
  it('round trips structured values as JSON', () => {
    set('preferences', { volume: 45, darkTheme: true });
    expect(JSON.parse(localStorage.getItem('preferences'))).toEqual({ volume: 45, darkTheme: true });
    expect(get('preferences')).toEqual({ volume: 45, darkTheme: true });
  });
  it('returns the supplied fallback when the key is absent', () => {
    expect(get('missing', 'default')).toBe('default');
  });
});
