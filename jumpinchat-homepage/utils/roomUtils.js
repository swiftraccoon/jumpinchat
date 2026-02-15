import createLogger from './logger.js';
import request from './request.js';
import config from '../config/index.js';
import { colours, errors, api } from '../constants/constants.js';
import Room from '../models/Room.js';
import RecentRooms from '../models/RecentRooms.js';

const log = createLogger({ name: 'roomUtils' });

/**
 * Get a count of the number of active rooms
 *
 * @param {Function} cb
 */
export function getRoomCount(cb) {
  Room
    .countDocuments({
      $or: [
        { users: { $gt: [] } },
        { 'attrs.owner': { $ne: null } },
      ],
      'attrs.active': true,
      'settings.public': true,
    })
    .exec()
    .then(
      (count) => cb(null, count),
      (err) => cb(err),
    );
}

/**
 * Get a list of rooms, with a start and end for pagination.
 *
 * @param {Number} start
 * @param {Number} end
 * @param {Function} cb
 * @returns {void}
 */
export async function getRoomList(start = 0, end = 9, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/rooms/public?start=${start}&end=${end}`,
      headers: {
        Authorization: config.auth.sharedSecret,
      },
    });

    const data = {
      ...body,
      rooms: body.rooms.map((room, i) => Object.assign({}, room, {
        color: colours[i % colours.length],
      })),
    };

    return cb(null, data);
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        log.error({ message: body.message }, 'error getting room list');
        return cb(body.message);
      }
      log.error({ statusCode: err.response.status }, 'error getting room list');
      return cb('error');
    }
    log.fatal({ err }, 'error fetching room list');
    return cb(err);
  }
}

export function getRoomByName(name, cb) {
  const query = Room
    .findOne({ name })
    .populate({
      path: 'settings.moderators.user_id',
      select: ['username', 'profile.pic'],
    })
    .populate({
      path: 'settings.moderators.assignedBy',
      select: ['username', 'profile.pic'],
    });
  if (cb) {
    return query.exec().then(
      (room) => cb(null, room),
      (err) => cb(err),
    );
  }

  return query.exec();
}

export function getRoomById(id) {
  return Room
    .findOne({ _id: id })
    .exec();
}

export async function adminGetRoomList(token, page, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/admin/rooms?page=${page}`,
      headers: {
        Authorization: token,
      },
    });
    return cb(null, body);
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        return cb(body.message);
      }
      log.error({ statusCode: err.response.status }, 'error getting room list');
      return cb(errors.ERR_SRV);
    }
    log.error({ err }, 'error happened');
    return cb(err);
  }
}

export async function sendBan(token, reason, { restrictBroadcast = false, restrictJoin = false }, user, expires, reportId) {
  const {
    session_id,
    user_id,
    ip,
    socket_id,
  } = user;

  const body = {
    userId: user_id,
    sessionId: session_id,
    ip,
    restrictBroadcast,
    restrictJoin,
    socketId: socket_id,
    reason,
    expires,
    reportId,
  };

  try {
    await request({
      method: 'POST',
      url: `${api}/api/admin/siteban`,
      headers: {
        Authorization: token,
      },
      body,
    });
    return 'User banned';
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error sending site ban');
      throw errors.ERR_SRV;
    }
    log.fatal({ err }, 'error sending request');
    throw errors.ERR_SRV;
  }
}

export function getRecentRooms(user) {
  return RecentRooms
    .findOne({ user })
    .populate('rooms.roomId')
    .lean()
    .exec();
}

export async function getRoomEmoji(roomName) {
  try {
    return await request({
      method: 'GET',
      url: `${api}/api/rooms/${roomName}/emoji`,
    });
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error fetching room emoji');
      throw errors.ERR_SRV;
    }
    log.fatal({ err }, 'error sending request');
    throw errors.ERR_SRV;
  }
}

export function checkUserIsMod(userId, room) {
  const { moderators } = room.settings;

  const isMod = moderators.some((m) => {
    const mod = String(userId) === String(m.user_id);
    const isPerm = String(m.assignedBy) === String(room.attrs.owner) || !m.assignedBy;
    return mod && isPerm;
  });

  const isOwner = String(room.attrs.owner) === String(userId);

  return isMod || isOwner;
}
