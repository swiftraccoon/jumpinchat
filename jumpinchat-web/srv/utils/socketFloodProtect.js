const log = require('./logger.util')({ name: 'socketFloodProtect' });
const redis = require('../lib/redis.util')();
const config = require('../config/env');
const { FloodError } = require('./error.util');

async function setKey(key) {
  try {
    await redis.set(key, 1);
  } catch (err) {
    log.fatal({ err }, 'failed to set flood key');
    throw err;
  }

  try {
    await redis.expire(key, config.room.floodRefresh);
    log.debug({ key }, 'expire set on flood key');
  } catch (err) {
    log.fatal({ err }, 'failed to set flood key');
    throw err;
  }
}

module.exports = async function socketFloodProtect(socket, io) {
  const key = `flood:${socket.id}`;

  let value;
  try {
    value = await redis.get(key);
  } catch (err) {
    log.fatal({ err }, 'failed to get flood key');
    throw err;
  }

  log.debug({ value, key }, 'socket flood protect');

  if (!value) {
    await setKey(key);
    log.info({ key }, 'new flood key set');
    return;
  }

  if (Number(value) > config.room.floodLimit) {
    log.warn({ key }, 'flood limit reached');
    try {
      await redis.expire(key, config.room.floodTimeout);
    } catch (err) {
      log.fatal({ err, key }, 'failed to reset expire on flood key');
      throw err;
    }

    throw new FloodError('Flood limit reached. Please enhance your calm.');
  }

  try {
    await redis.incr(key);
    log.debug({ key }, 'key value incremented');
  } catch (err) {
    log.fatal({ err }, 'failed to get flood key');
    throw err;
  }
};
