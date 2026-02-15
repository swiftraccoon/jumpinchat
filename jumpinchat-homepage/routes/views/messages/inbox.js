import url from 'url';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import Pagination from 'pagination-object';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import { errors, successMessages, api } from '../../../constants/constants.js';

const log = logFactory({ name: 'messages.inbox' });

export default async function messageInbox(req, res) {
  const { error, success, page = 1 } = req.query;
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Messages | Inbox';
  locals.user = req.user;
  locals.page = page;
  locals.error = error || null;
  locals.success = success || null;
  locals.conversations = [];

  // Init phase
  if (!locals.user) {
    return res.redirect('/');
  }

  const token = jwt.sign(String(req.user._id), config.auth.jwtSecret);

  const urlParams = url.format({
    path: '/',
    query: {
      page: locals.page,
    },
  });

  try {
    const response = await axios({
      url: `${api}/api/message/${locals.user._id}${urlParams}`,
      method: 'GET',
      headers: {
        Authorization: token,
      },
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      if (response.data && response.data.message) {
        locals.errors = response.data.message;
      } else {
        locals.errors = errors.ERR_SRV;
      }
    } else {
      locals.conversations = response.data.conversations.sort((a, b) => {
        const aTime = new Date(a.latestMessage).getTime();
        const bTime = new Date(b.latestMessage).getTime();
        if (aTime < bTime) return 1;
        if (aTime > bTime) return -1;
        return 0;
      });

      if (response.data.count > 0) {
        locals.pagination = new Pagination({
          currentPage: Number(locals.page),
          totalItems: response.data.count,
          itemsPerPage: config.admin.userList.itemsPerPage,
          rangeLength: 9,
        });
      }
    }
  } catch (err) {
    log.error({ err }, 'error retrieving conversations');
    locals.error = errors.ERR_SRV;
  }

  // POST: read
  if (req.method === 'POST' && req.body.action === 'read') {
    try {
      const readResponse = await axios({
        url: `${api}/api/message/read`,
        method: 'PUT',
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (readResponse.status >= 400) {
        log.error({ body: readResponse.data });
        if (readResponse.data && readResponse.data.message) {
          locals.error = readResponse.data.message;
        } else {
          locals.error = errors.ERR_SRV;
        }
        return res.redirect(url.format({
          path: './',
          query: {
            error: locals.error,
          },
        }));
      }

      log.info('conversation marked read');
      locals.success = 'Conversations marked as read';

      return res.redirect(`/messages?success=${locals.success}`);
    } catch (err) {
      log.error({ err }, 'error marking as read');
      locals.error = errors.ERR_SRV;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  return res.render('messages/inbox');
}
