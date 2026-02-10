
import _ from 'lodash';
const { merge } = _;
import logFactory from '../utils/logger.util.js';
const log = logFactory({ name: 'session.config' });
export function initialSession(session) {
  return merge({
    ageConfirmed: false,
    ignoreList: [],
  }, session);
};
