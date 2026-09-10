import { describe, it, expect, vi, afterEach } from 'vitest';
import uuid from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses crypto.randomUUID when available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-4333-8444-555555555555' });
    expect(uuid()).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('builds a v4 identifier from getRandomValues otherwise', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes) => { bytes.fill(255); return bytes; } });
    expect(uuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('produces unique v4 identifiers', () => {
    const ids = new Set(Array.from({ length: 20 }, uuid));
    expect(ids.size).toBe(20);
    ids.forEach(id => expect(id).toMatch(V4));
  });
});
