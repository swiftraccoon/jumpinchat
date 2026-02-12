import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { verifyFileToken } from '../../utils/fileToken.util.js';
import config from '../../config/env/index.js';
import logFactory from '../../utils/logger.util.js';

const log = logFactory({ name: 'internal.file' });
const router = express.Router();

const ALLOWED_EXTENSIONS = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
};

router.get('/file/:token', async (req, res) => {
  const decoded = verifyFileToken(req.params.token);
  if (!decoded) {
    return res.status(403).send({ error: 'Invalid or expired token' });
  }

  const filePath = decoded.path;

  // Path containment — only serve files from private upload directory
  const basePath = config.uploads.basePath || '/data/uploads';
  const privateBase = path.resolve(basePath, 'private');
  if (!path.resolve(filePath).startsWith(privateBase + path.sep)) {
    log.warn({ filePath }, 'path containment violation');
    return res.status(403).send({ error: 'Invalid file path' });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = ALLOWED_EXTENSIONS[ext];

  if (!contentType) {
    log.warn({ ext }, 'disallowed file extension');
    return res.status(403).send({ error: 'File type not allowed' });
  }

  // Verify file exists (async to avoid blocking event loop)
  try {
    await fs.access(filePath);
  } catch {
    log.warn({ filePath }, 'private file not found');
    return res.status(404).send({ error: 'File not found' });
  }

  res.set('Content-Type', contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Disposition', 'inline');
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.set('Cross-Origin-Resource-Policy', 'same-site');

  const { createReadStream } = await import('fs');
  const stream = createReadStream(filePath);
  stream.on('error', (err) => {
    log.error({ err, filePath }, 'error streaming private file');
    if (!res.headersSent) {
      res.status(500).send({ error: 'Error reading file' });
    }
  });

  return stream.pipe(res);
});

export default router;
