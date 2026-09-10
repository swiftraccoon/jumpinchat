import { expect } from 'chai';
import { escapeRegExp } from './string.util.js';

describe('string.util escapeRegExp', () => {
  it('escapes regular expression metacharacters', () => {
    expect(escapeRegExp('a.b*c+d?e(f)g[h]i{j}k|l^m$n\\o')).to.equal('a\\.b\\*c\\+d\\?e\\(f\\)g\\[h\\]i\\{j\\}k\\|l\\^m\\$n\\\\o');
  });

  it('produces a pattern that matches the literal text', () => {
    const handle = 'guest_1 (cool?)';
    expect(new RegExp(`@${escapeRegExp(handle)}`).test(`hey @${handle}!`)).to.equal(true);
    expect(new RegExp(`@${escapeRegExp(handle)}`).test('hey @guest_1 cool')).to.equal(false);
  });

  it('coerces non-strings', () => {
    expect(escapeRegExp(42)).to.equal('42');
  });
});
