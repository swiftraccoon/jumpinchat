import logFactory from '../utils/logger.util.js';

const log = logFactory({ name: 'asyncErrorHandler' });

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  log.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');

  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction ? 'Internal server error' : (err.message || 'Internal server error');

  return res.status(status).json({ error: message });
}
