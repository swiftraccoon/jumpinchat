import { isIP } from 'node:net';

const FORWARDING_HEADERS = ['x-real-ip', 'x-client-ip', 'cf-connecting-ip', 'true-client-ip'];

function normalizeAddress(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim();
  // Check the complete address first so an IPv6 suffix is never mistaken for a port.
  if (isIP(address)) return address;

  const withPort = address.match(/^(.+):(\d+)$/);
  if (withPort && isIP(withPort[1]) === 4 && Number(withPort[2]) <= 65535) {
    return withPort[1];
  }
  return null;
}

/**
 * First valid X-Forwarded-For address, then valid single-address proxy
 * headers in their existing priority order, then socket/connection addresses.
 */
export function getClientIp(req) {
  const headers = req?.headers || {};
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    for (const value of forwarded.split(',')) {
      const address = normalizeAddress(value);
      if (address) return address;
    }
  }

  for (const name of FORWARDING_HEADERS) {
    const address = normalizeAddress(headers[name]);
    if (address) return address;
  }

  for (const value of [req?.socket?.remoteAddress, req?.connection?.remoteAddress, req?.ip]) {
    const address = normalizeAddress(value);
    if (address) return address;
  }
  return null;
}

export default { getClientIp };
