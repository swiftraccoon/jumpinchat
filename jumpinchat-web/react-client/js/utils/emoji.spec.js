import { describe, it, expect } from 'vitest';
import { searchEmoji, normalizeEmoji, pickerCustomEmoji } from './emoji';

describe('Emoji Mart 5 compatibility', () => {
  it('searches the installed emoji data and keeps colon codes usable by chat', async () => {
    const results = await searchEmoji('smile');
    expect(results.length).toBeGreaterThan(0); expect(results.length).toBeLessThanOrEqual(40);
    expect(results.every(result => result.id && /^:.*:$/.test(result.colons))).toBe(true);
  });
  it('preserves skin-tone shortcodes and custom room emoji images', () => {
    expect(normalizeEmoji({ id: 'wave', shortcodes: ':wave::skin-tone-3:' }).colons).toBe(':wave::skin-tone-3:');
    expect(pickerCustomEmoji([{ id: 'roomwave', name: 'Room wave', imageUrl: '/uploads/wave.png' }])[0].emojis[0]).toMatchObject({ id: 'roomwave', skins: [{ src: '/uploads/wave.png' }] });
  });
});
