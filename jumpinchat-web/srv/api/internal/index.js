import express from 'express';
import path from 'path';
import { verifyFileToken } from '../../utils/fileToken.util.js';
import { readPrivate } from '../../lib/storage.js';
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

  if (typeof filePath !== 'string') {
    return res.status(403).send({ error: 'Invalid file path' });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = ALLOWED_EXTENSIONS[ext];

  if (!contentType) {
    log.warn({ ext }, 'disallowed file extension');
    return res.status(403).send({ error: 'File type not allowed' });
  }

  // The backend validates private scope and opens the file only after token verification.
  let stream;
  try {
    stream = await readPrivate(filePath);
  } catch (err) {
    if (err.code === 'EPRIVATEPATH') {
      log.warn('private file path rejected');
      return res.status(403).send({ error: 'Invalid file path' });
    }
    if (err.code === 'ENOENT') {
      return res.status(404).send({ error: 'File not found' });
    }
    log.error({ err }, 'error opening private file');
    return res.status(500).send({ error: 'Error reading file' });
  }

  if (res.destroyed) {
    stream.destroy();
    return undefined;
  }

  res.set('Content-Type', contentType);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Disposition', 'inline');
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.set('Cross-Origin-Resource-Policy', 'same-site');

  res.once('close', () => stream.destroy());
  stream.on('error', (err) => {
    log.error({ err }, 'error streaming private file');
    if (!res.headersSent) {
      res.status(500).send({ error: 'Error reading file' });
    } else {
      res.destroy();
    }
  });

  return stream.pipe(res);
});

export default router;
