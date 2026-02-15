import jwt from 'jsonwebtoken';
import { isBefore, formatRelative } from 'date-fns';
import Pagination from 'pagination-object';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import { getMessageReports } from '../../../utils/reportUtils.js';

const log = logFactory({ name: 'routes.admin' });

export default async function messageReportList(req, res) {
  const { page = 1 } = req.query;
  const { locals } = res;

  locals.section = `Admin | ${locals.page}`;
  locals.user = req.user;
  locals.page = page;

  // Init phase
  if (!locals.user) {
    log.warn('no user');
    return res.redirect('/');
  }

  if (locals.user.attrs.userLevel < 30) {
    log.warn({
      userId: locals.user._id,
      userLevel: locals.user.attrs.userLevel,
    }, 'user is not an admin');
    return res.redirect('/');
  }

  let token;
  try {
    token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });
  } catch (err) {
    log.fatal({ err }, 'failed to create token');
    return res.status(500).send(err);
  }

  await new Promise((resolve) => {
    getMessageReports(token, locals.page, (err, result) => {
      if (err) {
        return resolve();
      }

      const { reports, count } = result;

      if (count > 0) {
        locals.pagination = new Pagination({
          currentPage: Number(locals.page),
          totalItems: count,
          itemsPerPage: config.admin.userList.itemsPerPage,
          rangeLength: 9,
        });
      }

      locals.reports = reports
        .sort((a, b) => {
          const aDate = new Date(a.createdAt);
          const bDate = new Date(b.createdAt);
          if (isBefore(aDate, bDate)) return 1;
          if (isBefore(bDate, aDate)) return -1;
          return 0;
        })
        .map(r => Object.assign({}, r, {
          createdAt: formatRelative(new Date(r.createdAt), new Date()),
        }));

      return resolve();
    });
  });

  return res.render('admin/messageReportList');
}
