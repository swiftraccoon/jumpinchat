
import redis from 'redis';
import config from '../config/env/index.js';
import logFactory from '../utils/logger.util.js';
const log = logFactory({ name: 'redis.util' });
let client;

log.debug({ redisConfig: config.redis });

function createClient() {
  const opts = {};

  if (config.redis) {
    log.debug('has redis config');
    opts.url = config.redis.uri;
  } else {
    log.debug('using default redis config');
  }

  client = redis.createClient(opts);

  client.on('ready', () => {
    log.info('redis server ready');
  });

  client.on('connect', () => {
    log.info('redis server connected');
  });

  client.on('reconnecting', () => {
    log.warn('redis server reconnecting');
  });

  client.on('error', (err) => {
    log.fatal({ err }, 'redis error');
  });

  // Start connecting (commands will queue until connected)
  client.connect().catch((err) => {
    log.fatal({ err }, 'redis connection failed');
  });
}

createClient();

export default function redisUtil() {
  return client;
};
