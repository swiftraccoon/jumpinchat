import { expect } from 'chai';
import { getPublicBaseUrl } from './publicBaseUrl.js';

describe('public base URL configuration', () => {
  it('defaults an absent or blank value to the existing public site', () => {
    expect(getPublicBaseUrl(null)).to.equal('https://jumpin.chat');
    expect(getPublicBaseUrl('')).to.equal('https://jumpin.chat');
  });

  it('normalizes HTTPS origins while preserving a local port or IPv6 address', () => {
    expect(getPublicBaseUrl('https://localhost:18443/')).to.equal('https://localhost:18443');
    expect(getPublicBaseUrl('https://[::1]:18443')).to.equal('https://[::1]:18443');
    expect(getPublicBaseUrl('https://EXAMPLE.com:443/')).to.equal('https://example.com');
  });

  it('rejects non-origin configuration without echoing the supplied value', () => {
    for (const value of [
      'http://localhost:18443', 'localhost:18443', 'https://',
      'https://name:password@example.com', 'https://example.com/path',
      'https://example.com/path/..', 'https://example.com?query=yes',
      'https://example.com#fragment', 'https://example.com?',
      'https://example.com#', ' https://example.com ',
      'https://example.com\\', 'https://@example.com',
    ]) {
      expect(() => getPublicBaseUrl(value)).to.throw(
        'PUBLIC_BASE_URL must be an HTTPS origin without credentials, a path, query or fragment',
      );
    }
  });
});
