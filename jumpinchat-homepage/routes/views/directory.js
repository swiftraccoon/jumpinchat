import Pagination from 'pagination-object';
import logFactory from '../../utils/logger.js';
import { getRoomList, getRoomCount } from '../../utils/roomUtils.js';

const log = logFactory({ name: 'views.directory' });

export default async function directory(req, res) {
  const { locals } = res;
  const resultsPerPage = 9;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Room list';
  locals.description = 'Browse existing chat rooms. Rooms are ordered by user count and most recent activity.';
  locals.rooms = [];
  locals.roomListError = false;
  locals.user = req.user;
  locals.page = req.query.page || 1;
  locals.roomCount = 0;
  locals.pagination = null;

  // Init phase - getRoomList uses callback style
  const start = ((locals.page - 1) * resultsPerPage);

  await new Promise((resolve, reject) => {
    getRoomList(start, resultsPerPage, (err, data) => {
      if (err) {
        return reject(err);
      }

      const { rooms, count } = data;

      if (count > 0) {
        locals.pagination = new Pagination({
          currentPage: Number(locals.page),
          totalItems: count,
          itemsPerPage: resultsPerPage,
          rangeLength: 9,
        });
      }

      locals.rooms = rooms;
      return resolve();
    });
  }).catch(() => {
    // error already handled in getRoomList
  });

  // GET action handling
  if (req.method === 'GET' && req.query.action === 'room.get') {
    return res.redirect(`/${req.query.roomname}`);
  }

  // Render the view
  return res.render('directory');
}
