import { expect } from 'chai';
import { getPublicBaseUrl } from './publicUrl.js';

describe('public site origin', () => {
  it('keeps the existing origin when no override is configured', () => {
    expect(getPublicBaseUrl('')).to.equal('https://jumpin.chat');
  });

  it('normalizes an HTTPS deployment origin and preserves its port', () => {
    expect(getPublicBaseUrl('https://LOCALHOST:8443/')).to.equal('https://localhost:8443');
  });

  it('rejects values that cannot be used consistently in account email links', () => {
    for (const value of ['http://localhost:8080', '/relative', 'not a URL',
      'https://user:private@host.test', 'https://host.test/path',
      'https://host.test/?token=private', 'https://host.test/#private',
      ' https://host.test', 'https://host.test?', 'https://host.test/#',
      'https://host.test/path/..']) {
      expect(() => getPublicBaseUrl(value)).to.throw('PUBLIC_BASE_URL must be an HTTPS origin');
      try { getPublicBaseUrl(value); } catch (error) {
        expect(error.message).not.to.include('private');
      }
    }
  });
});
