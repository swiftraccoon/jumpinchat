const redis = require('../lib/redis.util')();

// Map redis v2 method names to v4 equivalents
const methodMap = {
  hmset: 'hSet',
  hgetall: 'hGetAll',
};

module.exports.callPromise = async function callPromise(method, ...args) {
  const v4Method = methodMap[method] || method;
  const result = await redis[v4Method](...args);

  // hGetAll returns {} for missing keys in v4, but callers expect null (v2 behavior)
  if ((method === 'hgetall' || method === 'hGetAll') && result && Object.keys(result).length === 0) {
    return null;
  }

  return result;
};
