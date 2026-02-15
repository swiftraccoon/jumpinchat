import logFactory from '../utils/logger.util.js';

const log = logFactory({ name: 'socket' });

export function safeHandler(handler, eventName) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      log.error({ err, event: eventName }, 'Socket handler error');
    }
  };
}
