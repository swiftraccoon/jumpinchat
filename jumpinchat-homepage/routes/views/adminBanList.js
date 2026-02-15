import jwt from 'jsonwebtoken';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { Banlist } from '../../models/index.js';

const log = logFactory({ name: 'routes.adminBanList' });

export default async function adminBanList(req, res) {
  const { locals } = res;

  locals.section = 'Admin | Banlist';
  locals.page = 'banlist';
  locals.user = req.user;
  locals.banlist = [];

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });
  const banlist = await Banlist
    .find({})
    .lean()
    .sort('-createdAt');
  locals.banlist = banlist.map(item => Object.assign(item, {
    ip: !!item.ip && item.ip.replace(/\d{1,3}\.\d{1,3}$/, '0.0'),
  }));

  log.debug({ userIds: locals.banlist.map(b => b.userId) });

  return res.render('adminBanList');
}
