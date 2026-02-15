import jwt from 'jsonwebtoken';
import Pagination from 'pagination-object';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import {
  getModActivity,
} from '../../../utils/adminUtils.js';

const log = logFactory({ name: 'routes.adminRoomCloseList' });

export default async function adminModActivity(req, res) {
  const { locals } = res;
  const {
    success,
    error,
    page,
  } = req.query;

  locals.section = 'Admin | Site mods | Activity';
  locals.page = 'sitemods';
  locals.user = req.user;
  locals.roomCloses = [];
  locals.error = error || null;
  locals.success = success || null;
  locals.pageNumber = page || 1;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  try {
    locals.activity = await getModActivity(token, locals.pageNumber);
  } catch (err) {
    log.fatal({ err }, 'failed to fetch site mods');
    return res.status(500).send();
  }

  if (locals.activity.count > 0) {
    locals.pagination = new Pagination({
      currentPage: Number(locals.pageNumber),
      totalItems: locals.activity.count,
      itemsPerPage: config.admin.userList.itemsPerPage,
      rangeLength: 9,
    });
  }

  return res.render('admin/modActivity');
}
