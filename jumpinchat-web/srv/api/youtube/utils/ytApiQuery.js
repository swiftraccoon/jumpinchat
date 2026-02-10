
import axios from 'axios';
import logFactory from '../../../utils/logger.util.js';
import encodeUriParams from '../../../utils/encodeUriParams.js';
import getCurrentCred from './getCurrentCred.js';
const log = logFactory({ name: 'ytAPiQuery' });
export default async function ytApiQuery(url, urlParams, method = 'GET') {
  if (typeof urlParams !== 'object') {
    throw new TypeError('url params must be an object');
  }

  log.debug({ url, urlParams }, 'ytApiQuery');

  const apiKey = await getCurrentCred({ hasExpired: false });

  log.debug({ apiKey }, 'got current cred');

  const response = await axios({
    method,
    url: `${url}?${encodeUriParams({ ...urlParams, key: apiKey })}`,
    validateStatus: () => true,
  });

  const body = response.data;

  if (response.status >= 400) {
    log.warn({ body }, `error code from yt api: ${response.status}`);

    if (body.error && body.error.errors) {
      const [error] = body.error.errors;

      if (error.reason === 'dailyLimitExceeded' || error.reason === 'quotaExceeded') {
        log.error({ error }, 'Youtube quota exceeded');

        const e = new Error();
        e.name = 'ExternalProviderError';
        e.message = 'YouTube quota exceeded. Quota will be reset at midnight PST';
        throw e;
      }
    }

    throw new Error(`YouTube API error: ${response.status}`);
  }

  return body.items;
};
