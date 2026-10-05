import userUtils from '../api/user/user.utils.js';
import logFactory from './logger.util.js';

const log = logFactory({ name: 'roomTheme' });

// null means guest: the browser can then restore its own local preference.
export default async function getInitialAccountDarkTheme(req) {
  const accountId = req.signedCookies?.['jic.ident'];
  if (!accountId || typeof accountId !== 'string') return null;
  try {
    const user = await userUtils.getUserById(accountId, { lean: true });
    if (!user) return null;
    return user.settings?.darkTheme !== false;
  } catch (error) {
    log.warn({ err: error }, 'Could not load initial room appearance');
    return null;
  }
}
