import jwt from 'jsonwebtoken';
import Joi from 'joi';
import axios from 'axios';
import Pagination from 'pagination-object';
import { isBefore, formatRelative } from 'date-fns';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { adminGetRoomList } from '../../utils/roomUtils.js';
import {
  adminGetUsers,
  adminGetUserCount,
  searchUserByUsername,
} from '../../utils/userUtils.js';
import { getReports } from '../../utils/reportUtils.js';
import { getRequests } from '../../utils/ageVerifyUtils.js';
import { api, errors } from '../../constants/constants.js';

const log = logFactory({ name: 'routes.admin' });

const pageNames = {
  PAGE_DASHBOARD: 'dashboard',
  PAGE_ROOMLIST: 'rooms',
  PAGE_USERLIST: 'users',
  PAGE_REPORTS: 'reports',
  PAGE_AGE_VERIFY: 'ageverify',
};

export default async function admin(req, res) {
  const { locals } = res;

  locals.page = req.params.page;
  locals.section = `Admin | ${locals.page}`;
  locals.user = req.user;
  locals.users = [];
  locals.rooms = [];
  locals.requests = [];
  locals.stats = {};
  locals.pageNumber = req.query.page || 1;

  const pages = [
    pageNames.PAGE_DASHBOARD,
    pageNames.PAGE_ROOMLIST,
    pageNames.PAGE_USERLIST,
    pageNames.PAGE_REPORTS,
    pageNames.PAGE_AGE_VERIFY,
  ];

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

  switch (locals.page) {
    case pageNames.PAGE_DASHBOARD: {
      await new Promise((resolve) => {
        adminGetRoomList(token, 1, (err, body) => {
          if (err) {
            log.error({ err }, 'failed to get room list');
            return resolve();
          }

          const { rooms, count: roomCount } = body;
          log.debug({ token }, 'dashboard local token');
          locals.token = token;
          locals.rooms = rooms;
          locals.roomCount = roomCount;

          adminGetUserCount((countErr, userCount) => {
            if (countErr) {
              log.error({ err: countErr }, 'error getting user count');
            } else {
              locals.users = userCount;
            }
            return resolve();
          });
        });
      });
      break;
    }
    case pageNames.PAGE_ROOMLIST: {
      await new Promise((resolve) => {
        adminGetRoomList(token, locals.pageNumber, (err, roomList) => {
          if (err) {
            log.error({ err }, 'failed to get room list');
            return resolve();
          }

          const { rooms, count } = roomList;

          if (count > 0) {
            locals.pagination = new Pagination({
              currentPage: Number(locals.pageNumber),
              totalItems: count,
              itemsPerPage: config.admin.userList.itemsPerPage,
              rangeLength: 9,
            });
          }

          locals.rooms = rooms;
          return resolve();
        });
      });
      break;
    }
    case pageNames.PAGE_USERLIST: {
      const { search } = req.query;

      if (search) {
        await new Promise((resolve) => {
          searchUserByUsername(search, true, (err, users) => {
            if (err) {
              log.fatal({ err });
              return resolve();
            }

            locals.pagination = new Pagination({
              currentPage: Number(locals.pageNumber),
              totalItems: users.length,
              itemsPerPage: config.admin.userList.itemsPerPage,
              rangeLength: 9,
            });

            locals.users = users
              .map(u => Object.assign({}, u, {
                attrs: Object.assign({}, u.attrs, {
                  join_date: formatRelative(new Date(u.attrs.join_date), new Date()),
                }),
              }));
            return resolve();
          });
        });
      } else {
        await new Promise((resolve) => {
          adminGetUsers(token, locals.pageNumber, (err, result) => {
            if (err) {
              log.error({ err });
              return resolve();
            }

            const { users, count } = result;

            locals.pagination = new Pagination({
              currentPage: Number(locals.pageNumber),
              totalItems: count,
              itemsPerPage: config.admin.userList.itemsPerPage,
              rangeLength: 9,
            });

            locals.users = users
              .sort((a, b) => {
                const aDate = new Date(a.attrs.join_date);
                const bDate = new Date(b.attrs.join_date);
                if (isBefore(aDate, bDate)) return 1;
                if (isBefore(bDate, aDate)) return -1;
                return 0;
              })
              .map(u => Object.assign({}, u, {
                attrs: Object.assign({}, u.attrs, {
                  join_date: formatRelative(new Date(u.attrs.join_date), new Date()),
                }),
              }))
              .filter(u => u.username);

            return resolve();
          });
        });
      }
      break;
    }
    case pageNames.PAGE_REPORTS: {
      await new Promise((resolve) => {
        getReports(token, locals.pageNumber, (err, result) => {
          if (err) {
            return resolve();
          }

          const { reports, count } = result;

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
            })
            .map(r => Object.assign({}, r, {
              createdAt: formatRelative(new Date(r.createdAt), new Date()),
            }));

          return resolve();
        });
      });
      break;
    }
    case pageNames.PAGE_AGE_VERIFY: {
      await new Promise((resolve) => {
        getRequests(token, (err, requests) => {
          if (err) {
            return resolve();
          }

          locals.statusColors = {
            PENDING: 'sub',
            DENIED: 'red',
            APPROVED: 'green',
            REJECTED: 'yellow',
          };

          locals.requests = requests.reverse();
          return resolve();
        });
      });
      break;
    }
    default:
      return res.redirect(`/admin/${pageNames.PAGE_DASHBOARD}`);
  }

  // POST: server-message
  if (req.method === 'POST' && req.body.action === 'server-message') {
    const schema = Joi.object({
      message: Joi.string().required(),
      type: Joi.string().required(),
    });

    const body = {
      message: req.body.message,
      type: req.body['message-type'],
    };

    const { error, value: validated } = schema.validate(body, { abortEarly: false });

    if (error) {
      log.warn({ err: error }, 'invalid message');
      locals.errors = errors.ERR_VALIDATION;
      return res.render('admin');
    }

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/admin/notify`,
        headers: {
          Authorization: token,
        },
        data: body,
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.error({ statusCode: response.status }, 'error getting room list');
          locals.error = 'error happened';
        }
      } else {
        locals.success = 'Message sent successfully';
      }
    } catch (err) {
      log.error({ err }, 'error happened');
      locals.error = 'error happened';
    }

    return res.render('admin');
  }

  // POST: user-emails
  if (req.method === 'POST' && req.body.action === 'user-emails') {
    const schema = Joi.object({
      emailMessage: Joi.string().required(),
      emailSubject: Joi.string().required(),
    });

    const body = {
      emailMessage: req.body.emailMessage,
      emailSubject: req.body.emailSubject,
    };

    const { error, value: validated } = schema.validate(body, { abortEarly: false });

    if (error) {
      log.warn({ err: error }, 'invalid message');
      locals.errors = errors.ERR_VALIDATION;
      return res.render('admin');
    }

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/admin/email/send`,
        headers: {
          Authorization: token,
        },
        data: {
          message: validated.emailMessage,
          subject: validated.emailSubject,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.error({ statusCode: response.status }, 'error sending email');
          locals.error = 'error happened';
        }
      } else {
        locals.success = 'Message sent successfully';
        return res.redirect('/admin/dashboard');
      }
    } catch (err) {
      log.error({ err }, 'error happened');
      locals.error = 'error happened';
    }

    return res.render('admin');
  }

  // POST: search-users
  if (req.method === 'POST' && req.body.action === 'search-users') {
    const { search } = req.body;
    return res.redirect(`/admin/users?search=${search}`);
  }

  return res.render('admin');
}
