import { expect } from 'chai';
import { getClientIp } from './ip.js';

describe('getClientIp proxy address normalization', () => {
  it('preserves X-Forwarded-For priority over other valid headers and the socket', () => {
    expect(getClientIp({
      headers: {
        'x-forwarded-for': ' 203.0.113.9 , 10.0.0.2',
        'x-real-ip': '198.51.100.1',
        'x-client-ip': '198.51.100.2',
      },
      socket: { remoteAddress: '127.0.0.1' },
    })).to.equal('203.0.113.9');
  });

  it('removes the IPv4 source port from ordinary proxy hops', () => {
    expect(getClientIp({ headers: {
      'x-forwarded-for': ' 203.0.113.9:48123, 10.0.0.2:443 ',
    } })).to.equal('203.0.113.9');
  });

  it('skips empty and non-address hops before a valid address', () => {
    expect(getClientIp({ headers: {
      'x-forwarded-for': ' , unknown, 203.0.113.9:48123, 10.0.0.2',
    } })).to.equal('203.0.113.9');
  });

  for (const address of ['2001:db8::1', '2001:db8::1234:8080', '::ffff:203.0.113.9']) {
    it(`preserves the complete IPv6 address ${address}`, () => {
      expect(getClientIp({ headers: {
        'x-forwarded-for': ` ${address} , 10.0.0.2`,
      } })).to.equal(address);
    });
  }

  it('keeps single-address header priority when forwarded hops are unusable', () => {
    expect(getClientIp({ headers: {
      'x-forwarded-for': 'unknown',
      'x-real-ip': ' 198.51.100.1 ',
      'x-client-ip': '198.51.100.2',
      'cf-connecting-ip': '198.51.100.3',
      'true-client-ip': '198.51.100.4',
    } })).to.equal('198.51.100.1');
  });

  it('skips invalid single-address headers to reach the next valid one', () => {
    expect(getClientIp({ headers: {
      'x-real-ip': 'unknown',
      'x-client-ip': ' ',
      'cf-connecting-ip': '198.51.100.3',
      'true-client-ip': '198.51.100.4',
    } })).to.equal('198.51.100.3');
    expect(getClientIp({ headers: {
      'cf-connecting-ip': 'unknown',
      'true-client-ip': '2001:db8::4',
    } })).to.equal('2001:db8::4');
  });

  it('rejects invalid IPv4 hosts and out-of-range or nonnumeric ports', () => {
    for (const forwarded of ['203.0.113.999:443', '203.0.113.9:65536', '203.0.113.9:https']) {
      expect(getClientIp({
        headers: { 'x-forwarded-for': forwarded },
        socket: { remoteAddress: '127.0.0.1' },
      })).to.equal('127.0.0.1');
    }
  });

  it('uses valid socket, connection and request addresses in that order', () => {
    expect(getClientIp({
      socket: { remoteAddress: '::1' }, connection: { remoteAddress: '127.0.0.1' },
    })).to.equal('::1');
    expect(getClientIp({
      socket: { remoteAddress: 'unknown' }, connection: { remoteAddress: '127.0.0.1' },
    })).to.equal('127.0.0.1');
    expect(getClientIp({
      socket: { remoteAddress: '' }, connection: { remoteAddress: 'unknown' }, ip: '2001:db8::5',
    })).to.equal('2001:db8::5');
  });

  it('ignores non-string headers instead of turning them into addresses', () => {
    expect(getClientIp({
      headers: { 'x-forwarded-for': 123, 'x-real-ip': ['198.51.100.1'] },
      socket: { remoteAddress: '::1' },
    })).to.equal('::1');
  });

  it('returns null when no valid address is available', () => {
    for (const req of [undefined, null, {}, { headers: {} }, {
      headers: { 'x-forwarded-for': ' , unknown', 'x-real-ip': 'unknown' },
      socket: { remoteAddress: 'unknown' }, ip: '',
    }]) {
      expect(getClientIp(req)).to.equal(null);
    }
  });
});
