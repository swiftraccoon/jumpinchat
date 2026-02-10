
import config from '../../../config/env/index.js';
import logFactory from '../../../utils/logger.util.js';
import * as redis from '../../../utils/redis.util.js';
const log = logFactory({ name: 'getCurrentCred' });
export default async function getCurrentCred(args = {}) {
  log.debug({ args }, 'getCurrentCred');
  const { hasExpired = false } = args;
  const apiKeys = config.yt.keys;
  const redisKey = 'ytapikey';

  const apiKey = await redis.callPromise('get', redisKey);

  if (!apiKey) {
    log.debug('no api key set, setting new value');
    const chosenKey = apiKeys[0];
    await redis.callPromise('set', redisKey, chosenKey);
    return chosenKey;
  }

  if (hasExpired) {
    log.debug('api key expired, setting new key');
    const currentKeyIndex = apiKeys.indexOf(apiKey);
    let newKey;
    // current key is last key
    if (currentKeyIndex === apiKeys.length - 1) {
      newKey = apiKeys[0];
    } else {
      newKey = apiKeys[currentKeyIndex + 1];
    }

    await redis.callPromise('set', redisKey, newKey);
  }

  log.debug('returning api key');

  return apiKey;
};
