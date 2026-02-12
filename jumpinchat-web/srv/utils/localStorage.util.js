import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import config from '../config/env/index.js';
import logFactory from './logger.util.js';

const log = logFactory({ name: 'localStorage' });
const uploadBasePath = config.uploads.basePath || '/data/uploads';

/**
 * Path traversal prevention — ensure resolved path stays within base directory.
 */
function safeResolve(base, relative) {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

/**
 * Filename sanitization — strip everything except alphanumeric, dash, underscore, dot, slash.
 */
function sanitizeFilePath(filePath) {
  return filePath
    .replace(/\0/g, '')
    .replace(/[^a-zA-Z0-9\-_./]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[./]+/, '');
}

/**
 * Magic byte validation — verify file header matches claimed MIME type.
 */
const MAGIC = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/gif': [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
};

export function validateMagicBytes(buffer, mimeType) {
  const sigs = MAGIC[mimeType];
  if (!sigs) return false;
  return sigs.some(s => buffer.subarray(0, s.length).equals(s));
}

/**
 * Atomic write to public uploads directory.
 * Writes to a temp file first, then renames to prevent partial reads.
 */
export async function localUpload(body, filePath) {
  const clean = sanitizeFilePath(filePath);
  const dest = safeResolve(path.join(uploadBasePath, 'public'), clean);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, dest);
  log.debug({ filePath: clean }, 'file uploaded to local storage');
}

/**
 * Remove a file from public uploads directory.
 */
export async function localRemove(filePath) {
  const clean = sanitizeFilePath(filePath);
  const dest = safeResolve(path.join(uploadBasePath, 'public'), clean);
  await fs.unlink(dest).catch(e => { if (e.code !== 'ENOENT') throw e; });
  log.debug({ filePath: clean }, 'file removed from local storage');
}

/**
 * Upload to private directory (not served by nginx).
 * Used for verification photos and report screenshots.
 */
export async function localUploadPrivate(body, subDir, filePath) {
  const clean = sanitizeFilePath(filePath);
  const dest = safeResolve(path.join(uploadBasePath, 'private', subDir), clean);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, dest);
  log.debug({ filePath: clean, subDir }, 'file uploaded to private storage');
  return dest;
}

export default {
  validateMagicBytes,
  localUpload,
  localRemove,
  localUploadPrivate,
};
