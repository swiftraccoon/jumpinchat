import { differenceInHours } from 'date-fns';
import Joi from 'joi';
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import redisUtils from '../../../utils/redis.util.js';
import config from '../../../config/env/index.js';
import errors from '../../../config/constants/errors.js';
import { getUserById } from '../../user/user.utils.js';
import BanlistModel from '../../siteban/siteban.model.js';
import sitebanUtils from '../../siteban/siteban.utils.js';
import adminUtils from '../admin.utils.js';
import reportUtils from '../../report/report.utils.js';
import { resolutionOutcomes } from '../../report/report.constants.js';
import adminConstants from '../admin.constants.js';
import roomCloseUtils from '../../roomClose/roomClose.utils.js';
import { getSocketIo } from '../admin.controller.js';
const log = logFactory({ name: 'siteBan.controller' });
import { getRoomsByUser } from '../../room/room.utils.js';

async function handleBanSocket(socketId, banEntry) {
  const io = getSocketIo();
  const {
    restrictions,
    sessionId,
    userId,
    ip,
  } = banEntry;

  let userRooms;

  try {
    userRooms = await getRoomsByUser({ userId, sessionId, ip });
  } catch (err) {
    log.fatal({ err }, 'failed to get user rooms');
    throw err;
  }

  log.debug({ userRooms }, 'rooms user joined');

  const userTargets = userRooms
    .map(r => ({ roomName: r.name, users: r.users }))
    .map(t => ({
      ...t,
      user: t.users
        .find(u => u.session_id === sessionId || String(u.user_id) === userId || u.ip === ip),
    }))
    .map(target => ({
      ...target,
      socketId: target.user.socket_id,
      handle: target.user.handle,
      ip: target.user.ip,
    }));

  log.debug({ userTargets }, 'user targets');

  userTargets.forEach((target) => {
    io.to(target.roomName).emit('room::status', utils.messageFactory({
      message: `${target.handle} was banned by a site mod`,
    }));

    if (restrictions.broadcast) {
      io.to(target.socketId).emit('self::closeBroadcast');
    }

    if (restrictions.join) {
      io.to(target.socketId).emit('self::banned');
      io.in(target.socketId).disconnectSockets(true);
    }

    log.debug({ ...target }, 'user banned');
    return true;
  });
}

export default async function siteBan(req, res) {
  const schema = Joi.object().keys({
    userId: Joi.string().allow(''),
    reason: Joi.string().required(),
    sessionId: Joi.string().required(),
    socketId: Joi.string().required(),
    ip: Joi.string().ip().required(),
    restrictBroadcast: Joi.boolean(),
    restrictJoin: Joi.boolean(),
    expires: Joi.date().iso(),
    reportId: Joi.string().allow(''),
  });

  const { error, value: validated } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    log.error({ err: error }, 'validation error');
    return res.status(400).send('ERR_VALIDATION');
  }

  const {
    userId,
    reason,
    sessionId,
    ip,
    restrictBroadcast,
    restrictJoin,
    expires,
    socketId,
    reportId,
  } = validated;

  let user;
  let report;
  const expiresAt = new Date(expires || Date.now() + (config.siteban.defaultExpire * 1000));
  const duration = differenceInHours(new Date(expiresAt.toISOString()), new Date());

  if (userId) {
    try {
      user = await getUserById(userId, { lean: true });
    } catch (err) {
      log.fatal({ err }, 'failed to close room');
      return res.status(500).send();
    }
  }

  if (restrictJoin) {
    if (user) {
      try {
        const { username } = user;
        await roomCloseUtils.closeRoom(username, reason, duration);
      } catch (err) {
        log.fatal({ err }, 'failed to close room');
      }
    }
  }

  if (reportId) {
    try {
      report = await reportUtils.getReportById(reportId);
    } catch (err) {
      log.fatal({ err, reportId }, 'failed to get report');
    }
  }

  try {
    const existingBan = await sitebanUtils.getBanlistItem({
      userId,
      sessionId,
      ip,
      fingerprint: user && user.auth.latestFingerprint,
    });

    if (existingBan) {
      log.debug({ existingBan }, 'ban item exists');
      existingBan.restrictions = {
        broadcast: existingBan.restrictions.broadcast || restrictBroadcast,
        join: existingBan.restrictions.join || restrictJoin,
      };

      existingBan.expiresAt = expiresAt;

      const updatedBan = await existingBan.save();
      return res.status(201).send(updatedBan);
    }
  } catch (err) {
    log.fatal({ err }, 'failed to get banlist item');
    return res.status(500).send(errors.ERR_SRV);
  }

  let socketData;
  try {
    socketData = await redisUtils.callPromise('hgetall', socketId);
  } catch (err) {
    log.fatal({ err }, 'failed to get socket data');
  }

  let fingerprint;
  let email;

  if (user) {
    ({ email, latestFingerprint: fingerprint } = user.auth);
  } else if (report) {
    ({ fingerprint } = report.target);
  } else if (socketData) {
    ({ fingerprint } = socketData);
  }

  const banEntry = {
    userId,
    username: user && user.username,
    email,
    sessionId,
    ip,
    reason,
    restrictions: {
      broadcast: restrictBroadcast,
      join: restrictJoin,
    },
    expiresAt,
    fingerprint,
  };

  log.debug({ banEntry }, 'creating new ban entry');

  let createdBanEntry;

  try {
    createdBanEntry = await BanlistModel.create(banEntry);
    log.info({ banEntry, createdBanEntry }, 'user site banned');

    handleBanSocket(socketId, banEntry);
  } catch (err) {
    log.fatal({ err }, 'error creating document');
    return res.status(500).send();
  }

  if (report) {
    try {
      const outcome = banEntry.restrictions.broadcast
        ? resolutionOutcomes.RESOLUTION_BAN_BROADCAST
        : resolutionOutcomes.RESOLUTION_BAN_JOIN;
      await reportUtils.resolveReport(report._id, req.user._id, outcome);
    } catch (err) {
      log.fatal({ err }, 'failed to resolve report');
    }
  }

  try {
    const action = {
      type: adminConstants.activity.SITE_BAN,
      id: String(createdBanEntry._id),
    };

    await adminUtils.addModActivity(req.user._id, action);
  } catch (err) {
    log.fatal({ err }, 'error adding acitivity entry');
    return res.status(500).send();
  }


  return res.status(201).send();
};
