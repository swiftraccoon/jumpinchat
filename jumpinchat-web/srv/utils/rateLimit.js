
import { RedisStore } from 'rate-limit-redis';
import rateLimit from 'express-rate-limit';
import logFactory from './logger.util.js';
import redisFactory from '../lib/redis.util.js';
import config from '../config/env/index.js';
const log = logFactory({ name: 'rateLimit' });
const redis = redisFactory();
const store = new RedisStore({
  sendCommand: (...args) => redis.sendCommand(args),
});

export default rateLimit({
  windowMs: config.auth.rateLimitDuration,
  limit: 10,
  store,
  keyGenerator: (req) => {
    let ip;

    if (req.headers['x-forwarded-for']) {
      ip = req.headers['x-forwarded-for']
        .split(',')
        .map(s => s.trim())[0];
    } else {
      ip = req.connection.remoteAddress;
    }

    log.debug({ ip }, 'gen rate limit key');

    return ip;
  },
  skip: req => req.headers['x-forwarded-for'] && req.headers['x-forwarded-for'].match(/^10\./),
});
