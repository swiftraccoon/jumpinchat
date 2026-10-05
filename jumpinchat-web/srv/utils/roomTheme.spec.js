import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('initial room account appearance', () => {
  let getUserById; let resolveTheme;
  beforeEach(async () => {
    getUserById = sinon.stub();
    resolveTheme = await esmock('./roomTheme.js', {
      '../api/user/user.utils.js': { default: { getUserById } },
      './logger.util.js': { default: () => ({ warn() {} }) },
    });
  });
  it('defers guests and invalid signed cookies to browser preference without querying an account', async () => {
    expect(await resolveTheme({})).to.equal(null);
    expect(await resolveTheme({ signedCookies: { 'jic.ident': false } })).to.equal(null);
    expect(getUserById.called).to.equal(false);
  });
  for (const darkTheme of [true, false, undefined]) {
    it(`preserves account preference ${darkTheme} with a dark fallback only when absent`, async () => {
      getUserById.resolves({ settings: { darkTheme } });
      expect(await resolveTheme({ signedCookies: { 'jic.ident': 'account' } })).to.equal(darkTheme !== false);
      expect(getUserById.calledWith('account', { lean: true })).to.equal(true);
    });
  }
  it('keeps the room available when an old account cookie is invalid or lookup fails', async () => {
    getUserById.resolves(null);
    expect(await resolveTheme({ signedCookies: { 'jic.ident': 'missing' } })).to.equal(null);
    getUserById.rejects(new Error('Unavailable'));
    expect(await resolveTheme({ signedCookies: { 'jic.ident': 'unavailable' } })).to.equal(null);
  });
});
