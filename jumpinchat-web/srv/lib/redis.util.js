const redis = require('redis');
const config = require('../config/env');
const log = require('../utils/logger.util')({ name: 'redis.util' });

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

module.exports = function redisUtil() {
  return client;
};
