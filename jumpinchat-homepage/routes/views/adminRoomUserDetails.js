import jwt from 'jsonwebtoken';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import {
  getRoomByName,
  sendBan,
} from '../../utils/roomUtils.js';
import {
  banReasons,
} from '../../constants/constants.js';

const log = logFactory({ name: 'routes.adminRoomUserDetails' });

export default async function adminRoomUserDetails(req, res) {
  const { locals } = res;

  const {
    success,
    error,
  } = req.query;

  const roomName = req.params.room;
  const { userListId } = req.params;

  locals.section = `Admin | Room ${roomName} | User ${userListId}`;
  locals.page = 'rooms';
  locals.user = req.user;
  locals.room = {};
  locals.roomUser = {};
  locals.banReasons = banReasons;
  locals.error = error || null;
  locals.success = success || null;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  const room = await getRoomByName(roomName);
  if (!room) {
    log.error('room not found');
    return res.status(404).send({ error: 'room not found' });
  }

  locals.room = room;
  const roomUser = room.users.find(u => String(u._id) === userListId);
  locals.roomUser = roomUser;

  if (!locals.roomUser) {
    log.warn('user not found');
    return res.status(404).send({ error: 'user not found' });
  }

  locals.isMod = !!room.settings.moderators
    .find(m => m.user_id === roomUser.user_id || m.session_token === roomUser.session_id);

  // POST: siteban
  if (req.method === 'POST' && req.body.action === 'siteban') {
    log.debug({ body: req.body });
    locals.error = null;
    const schema = Joi.object({
      reason: Joi.string().required(),
      duration: Joi.number().required(),
      restrictBroadcast: Joi.boolean().truthy('on'),
      restrictJoin: Joi.boolean().truthy('on'),
    });

    const requestBody = {
      reason: req.body.reason,
      duration: req.body.duration,
      restrictBroadcast: req.body.restrictBroadcast === 'on',
      restrictJoin: req.body.restrictJoin === 'on',
    };

    const { error: validationError, value: validated } = schema.validate(requestBody);

    if (validationError) {
      log.error({ err: validationError }, 'validation error');
      locals.error = 'Invalid request, reason probably missing';
      return res.render('adminRoomUserDetails');
    }

    const {
      reason,
      duration,
      restrictBroadcast,
      restrictJoin,
    } = validated;

    if (!restrictBroadcast && !restrictJoin) {
      locals.error = 'Select at least one ban type';
      return res.render('adminRoomUserDetails');
    }

    const expire = new Date(Date.now() + (1000 * 60 * 60 * Number(duration)));
    const type = { restrictJoin, restrictBroadcast };

    try {
      locals.success = await sendBan(token, reason, type, locals.roomUser, expire);
    } catch (err) {
      log.error({ err }, 'error sending ban request');
      locals.error = err;
    }

    return res.render('adminRoomUserDetails');
  }

  return res.render('adminRoomUserDetails');
}
