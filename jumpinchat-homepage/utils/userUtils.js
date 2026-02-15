/**
 * Created by Zaccary on 23/03/2017.
 */

import bcrypt from 'bcrypt';
import requestIp from 'request-ip';
import createLogger from './logger.js';
import request from './request.js';
import { api, errors } from '../constants/constants.js';
import User from '../models/User.js';

const log = createLogger({ name: 'utils.userUtils' });

export function getRemoteIpFromReq(req) {
  const ip = requestIp.getClientIp(req);
  return ip;
}

/**
 * Get a user by a unique ID. Takes a `lean` parameter which
 * will return a simple object if true.
 *
 * @param {String} userId
 * @param {Boolean} lean
 * @param cb
 */
export const getUserById = (userId, lean = true, cb) => {
  const query = User
    .findOne({ _id: userId })
    .lean(lean);


  if (cb) {
    return query.exec().then(
      (user) => {
        if (!user) {
          log.warn('User not found');
          return cb();
        }
        return cb(null, user);
      },
      (err) => {
        log.error(`Could not get user ${userId}`, err);
        return cb(err);
      },
    );
  }

  return query.exec();
};

export const searchUserByUsername = (term, lean = true, cb) => {
  const re = new RegExp(term, 'i');
  const query = User
    .find({
      username: {
        $regex: re,
      },
    })
    .limit(10)
    .lean(lean);

  if (!cb) {
    return query;
  }

  return query.exec().then(
    (users) => cb(null, users),
    (err) => cb(err),
  );
};

export const getUserByUsername = (username, cb) => {
  const query = User.findOne({ username });

  if (cb) {
    return query.exec().then(
      (user) => {
        if (!user) {
          log.warn(`User "${username}" not found`);
          return cb();
        }
        return cb(null, user);
      },
      (err) => {
        log.error(`Could not get user ${username}`, err);
        return cb(err);
      },
    );
  }

  return query.exec();
};

/**
 * Generate a bcrypt hash from a string.
 *
 * @param password
 * @param cb
 */
export const generatePassHash = (password, cb) => bcrypt.genSalt(10, (err, salt) => {
  if (err) {
    log.fatal('error generating salt', err);
    return cb(err);
  }

  return bcrypt.hash(password, salt, (hashErr, hash) => {
    if (hashErr) {
      log.fatal('error creating password hash', hashErr);
      return cb(hashErr);
    }

    return cb(null, hash);
  });
});

export function adminGetUserCount(cb) {
  return User.countDocuments().exec().then(
    (count) => cb(null, count),
    (err) => cb(err),
  );
}

export async function adminGetUsers(token, page, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/admin/users?page=${page}`,
      headers: {
        Authorization: token,
      },
    });
    return cb(null, body);
  } catch (err) {
    log.error({ err }, 'error happened');
    if (err.response && err.response.data && err.response.data.message) {
      return cb(err.response.data.message);
    }
    return cb(err);
  }
}

export async function adminApplyTrophy(token, userId, trophyName) {
  try {
    const body = await request({
      method: 'PUT',
      url: `${api}/api/trophy/apply/${userId}`,
      headers: {
        Authorization: token,
      },
      body: {
        trophyName,
      },
    });
    return body;
  } catch (err) {
    log.error({ err }, 'error happened');
    if (err.response && err.response.data && err.response.data.message) {
      throw err.response.data.message;
    }
    throw new Error(errors.ERR_SRV);
  }
}
