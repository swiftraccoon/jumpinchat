import jwt from 'jsonwebtoken';
import { isBefore } from 'date-fns';
import Pagination from 'pagination-object';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import { getReports } from '../../../utils/reportUtils.js';

const log = logFactory({ name: 'routes.sitemod.reportList' });

export default async function sitemodReportList(req, res) {
  const { locals } = res;

  locals.page = 'reports';
  locals.section = 'Sitemod | Report list';
  locals.user = req.user;
  locals.users = [];
  locals.rooms = [];
  locals.requests = [];
  locals.stats = {};
  locals.pageNumber = req.query.page || 1;

  // Init phase
  if (!locals.user) {
    log.warn('no user');
    return res.redirect('/');
  }

  if (locals.user.attrs.userLevel < 20) {
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
    getReports(token, locals.pageNumber, (err, body) => {
      if (err) {
        return resolve();
      }

      const { reports, count } = body;

      if (count > 0) {
        locals.pagination = new Pagination({
          currentPage: Number(locals.pageNumber),
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
        });

      return resolve();
    });
  });

  return res.render('sitemod/reportList');
}
