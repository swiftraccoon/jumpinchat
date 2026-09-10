
import { deepMerge as merge } from '../utils/object.util.js';
import logFactory from '../utils/logger.util.js';
const log = logFactory({ name: 'session.config' });
export function initialSession(session) {
  return merge({
    ageConfirmed: false,
    ignoreList: [],
  }, session);
};
