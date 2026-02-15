import jwt from 'jsonwebtoken';
import Joi from 'joi';
import axios from 'axios';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { getRoomByName } from '../../utils/roomUtils.js';
import {
  api,
  errors,
  closeReasons,
} from '../../constants/constants.js';

const log = logFactory({ name: 'routes.admin' });

export default async function adminRoomDetails(req, res) {
  const { locals } = res;

  const roomName = req.params.room;
  locals.section = `Admin | Room ${roomName}`;
  locals.page = 'rooms';
  locals.user = req.user;
  locals.room = {};
  locals.closeReasons = closeReasons;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  const room = await getRoomByName(roomName);
  if (!room) {
    log.error('room not found');
    return res.status(404).send({ error: 'room not found' });
  }
  locals.room = room;

  // POST: room
  if (req.method === 'POST' && req.body.action === 'room') {
    const schema = Joi.object({
      active: Joi.boolean().required(),
      public: Joi.boolean().required(),
    });

    const { error, value: validated } = schema.validate({
      active: req.body.active,
      public: req.body.public,
    }, { abortEarly: false });

    if (error) {
      log.warn({ err: error }, 'invalid message');
      locals.error = errors.ERR_VALIDATION;
      return res.render('adminRoomDetails');
    }

    locals.room.attrs.active = validated.active;
    locals.room.settings.public = validated.public;

    try {
      const savedRoom = await locals.room.save();
      locals.room = savedRoom;
      locals.success = 'Room saved';
    } catch (err) {
      log.fatal({ err }, 'failed to save room');
      locals.error = 'Failed to save room';
    }

    return res.render('adminRoomDetails');
  }

  // POST: close
  if (req.method === 'POST' && req.body.action === 'close') {
    const schema = Joi.object({
      reason: Joi.string().required(),
    });

    const { error, value } = schema.validate({ reason: req.body.reason }, { abortEarly: false });

    if (error) {
      log.warn({ err: error }, 'invalid reason');
      locals.error = 'invalid reason';
      return res.render('adminRoomDetails');
    }

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/admin/rooms/${locals.room.name}/close`,
        headers: {
          Authorization: token,
        },
        data: { reason: value.reason },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.error({ statusCode: response.status }, 'error getting room list');
          locals.error = `error happened: ${response.status}`;
        }
      } else {
        locals.success = 'Room closed';
      }
    } catch (err) {
      log.error({ err }, 'error happened');
      locals.error = 'error happened';
    }

    return res.render('adminRoomDetails');
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
      locals.error = 'invalid message';
      return res.render('adminRoomDetails');
    }

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/admin/notify`,
        headers: {
          Authorization: token,
        },
        data: Object.assign(body, {
          room: locals.room.name,
        }),
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

    return res.render('adminRoomDetails');
  }

  return res.render('adminRoomDetails');
}
