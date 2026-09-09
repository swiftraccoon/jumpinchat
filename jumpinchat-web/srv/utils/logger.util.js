import pino from 'pino';

export default function createLogger(opts = {}) {
  if (!opts.name) throw new Error('Logger requires a name');
  return pino({
    level: process.env.NODE_ENV === 'test' || process.env.TEST ? 'silent' : (process.env.LOG_LEVEL || 'info'),
    serializers: pino.stdSerializers,
    ...opts,
  });
}
