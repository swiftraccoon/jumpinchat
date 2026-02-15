import jwt from 'jsonwebtoken';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { getBanItem } from '../../utils/adminUtils.js';
import {
  errors,
  banReasons,
} from '../../constants/constants.js';

const log = logFactory({ name: 'routes.adminBanDetails' });

export default async function adminBanDetails(req, res) {
  const { locals } = res;

  const { banId } = req.params;
  locals.section = `Admin | ban ${banId}`;
  locals.page = 'banlist';
  locals.user = req.user;
  locals.report = {};

  // Init phase
  let token;
  try {
    token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });
  } catch (err) {
    log.error({ err }, 'error signing token');
    return res.status(401).send();
  }

  try {
    locals.ban = await getBanItem(token, banId);
  } catch (err) {
    log.fatal({ err }, 'error finding banlist item');
    return res.status(500).end();
  }

  locals.ban = {
    ...locals.ban,
    reason: banReasons[locals.ban.reason],
  };

  return res.render('adminBanDetails');
}
