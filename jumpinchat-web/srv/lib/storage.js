import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import config from '../config/env/index.js';
import logFactory from '../utils/logger.util.js';

const log = logFactory({ name: 'storage' });

const backend = config.storage?.backend || 'local';
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
    .replace(/[^a-zA-Z0-9\-_.\/]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[./]+/, '');
}

// ---------------------------------------------------------------------------
// Local backend
// ---------------------------------------------------------------------------

async function localUpload(key, buffer) {
  const clean = sanitizeFilePath(key);
  const dest = safeResolve(path.join(uploadBasePath, 'public'), clean);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${crypto.randomBytes(4).toString('hex')}`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, dest);
  log.debug({ key: clean }, 'file uploaded to local public storage');
}

function localGetUrl(key) {
  const clean = sanitizeFilePath(key);
  return `/uploads/${clean}`;
}

async function localRemove(key) {
  const clean = sanitizeFilePath(key);
  const dest = safeResolve(path.join(uploadBasePath, 'public'), clean);
  await fs.unlink(dest).catch((e) => { if (e.code !== 'ENOENT') throw e; });
  log.debug({ key: clean }, 'file removed from local public storage');
}

async function localUploadPrivate(buffer, subDir, key) {
  const cleanSub = sanitizeFilePath(subDir);
  const cleanKey = sanitizeFilePath(key);
  const dest = safeResolve(path.join(uploadBasePath, 'private', cleanSub), cleanKey);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp.${crypto.randomBytes(4).toString('hex')}`;
  await fs.writeFile(tmp, buffer);
  await fs.rename(tmp, dest);
  log.debug({ key: cleanKey, subDir: cleanSub }, 'file uploaded to local private storage');
  return dest;
}

// ---------------------------------------------------------------------------
// S3 backend (lazy init)
// ---------------------------------------------------------------------------

let s3Client = null;
let s3Bucket = null;

async function getS3Client() {
  if (s3Client) return s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  s3Bucket = config.storage?.s3Bucket || 'uploads';
  s3Client = new S3Client({
    endpoint: config.storage.s3Endpoint,
    credentials: {
      accessKeyId: config.storage.s3AccessKey,
      secretAccessKey: config.storage.s3SecretKey,
    },
    forcePathStyle: true,
    region: config.storage?.s3Region || 'us-east-1',
  });
  return s3Client;
}

async function s3Upload(key, buffer, contentType) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client();
  const clean = sanitizeFilePath(key);
  await client.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key: `public/${clean}`,
    Body: buffer,
    ContentType: contentType,
  }));
  log.debug({ key: clean }, 'file uploaded to S3 public');
}

function s3GetUrl(key) {
  const clean = sanitizeFilePath(key);
  return `/uploads/${clean}`;
}

async function s3Remove(key) {
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client();
  const clean = sanitizeFilePath(key);
  await client.send(new DeleteObjectCommand({
    Bucket: s3Bucket,
    Key: `public/${clean}`,
  }));
  log.debug({ key: clean }, 'file removed from S3 public');
}

async function s3UploadPrivate(buffer, subDir, key) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client();
  const cleanSub = sanitizeFilePath(subDir);
  const cleanKey = sanitizeFilePath(key);
  const s3Key = `private/${cleanSub}/${cleanKey}`;
  await client.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key: s3Key,
    Body: buffer,
  }));
  log.debug({ key: cleanKey, subDir: cleanSub }, 'file uploaded to S3 private');
  return s3Key;
}

// ---------------------------------------------------------------------------
// Export the correct backend
// ---------------------------------------------------------------------------

const backends = {
  local: {
    upload: localUpload,
    getUrl: localGetUrl,
    remove: localRemove,
    uploadPrivate: localUploadPrivate,
  },
  s3: {
    upload: s3Upload,
    getUrl: s3GetUrl,
    remove: s3Remove,
    uploadPrivate: s3UploadPrivate,
  },
};

const selected = backends[backend];

if (!selected) {
  throw new Error(`Unknown storage backend: ${backend}`);
}

export const { upload, getUrl, remove, uploadPrivate } = selected;

export default selected;
