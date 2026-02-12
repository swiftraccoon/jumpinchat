import crypto from 'crypto';
import config from '../config/env/index.js';
import logFactory from './logger.util.js';

const log = logFactory({ name: 'fileToken' });

function getSecret() {
  const secret = config.auth.fileTokenSecret;
  if (!secret) {
    throw new Error('FILE_TOKEN_SECRET is not configured — set config.auth.fileTokenSecret');
  }
  return secret;
}

/**
 * Generate an HMAC-signed URL for accessing a private file.
 * Returns a URL path like /api/internal/file/{payload}.{signature}
 *
 * @param {string} filePath - Absolute path to the private file
 * @param {number} expiresInSeconds - How long the URL should be valid
 * @returns {string} URL path
 */
export function generateSignedFileUrl(filePath, expiresInSeconds) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = Buffer.from(JSON.stringify({ path: filePath, exp })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

  return `/api/internal/file/${payload}.${signature}`;
}

/**
 * Verify an HMAC-signed file token.
 * Returns the decoded payload { path, exp } or null if invalid/expired.
 *
 * @param {string} token - The {payload}.{signature} string
 * @returns {{ path: string, exp: number } | null}
 */
export function verifyFileToken(token) {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) {
    log.warn('invalid token format — no dot separator');
    return null;
  }

  const payload = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64url');

  // Constant-time comparison — check lengths first to avoid timingSafeEqual throw
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    log.warn('invalid token signature');
    return null;
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch (e) {
    log.warn('failed to decode token payload');
    return null;
  }

  if (!decoded.path || !decoded.exp) {
    log.warn('token payload missing required fields');
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) {
    log.debug('token expired');
    return null;
  }

  return decoded;
}

export default { generateSignedFileUrl, verifyFileToken };
