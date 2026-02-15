import url from 'url';
import Joi from 'joi';
import { isAfter, format } from 'date-fns';
import logFactory from '../../../../utils/logger.js';
import { getUserById } from '../../../../utils/userUtils.js';
import {
  getRoomByName,
  checkUserIsMod,
} from '../../../../utils/roomUtils.js';
import { errors } from '../../../../constants/constants.js';

const log = logFactory({ name: 'room.settings' });

export default async function roomSettings(req, res) {
  const { locals } = res;
  const { roomName } = req.params;
  const {
    success,
    error,
  } = req.query;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = `${roomName} | Settings`;
  locals.page = 'info';
  locals.user = req.user;
  locals.room = null;
  locals.roomOwner = null;
  locals.supportExpires = null;
  locals.supportValid = true;
  locals.userIsMod = false;
  locals.error = error;
  locals.success = success;

  // Init phase
  try {
    locals.room = await getRoomByName(roomName);

    if (!locals.room || !locals.room.attrs.owner) {
      return res.redirect('/');
    }

    if (locals.user) {
      locals.userIsMod = checkUserIsMod(String(locals.user._id), locals.room);
    }
    locals.roomOwner = await getUserById(locals.room.attrs.owner);

    const { supportExpires } = locals.roomOwner.attrs;
    const supportValid = (supportExpires && isAfter(new Date(supportExpires), new Date())) || false;

    locals.supportValid = supportValid;
    if (supportValid) {
      locals.supportExpires = format(new Date(supportExpires), "yyyy-MM-dd'T'HH:mm:ssxxx");
    }
  } catch (err) {
    log.fatal({ err, roomName }, 'failed to fetch room');
    return res.status(500).end();
  }

  // POST: topic
  if (req.method === 'POST' && req.body.action === 'topic') {
    if (!locals.userIsMod) {
      return res.status(401).send();
    }

    const schema = Joi.object({
      topic: Joi.string().max(140).allow(''),
    });

    const { error: validationError, value } = schema.validate({ topic: req.body.topic });

    if (validationError) {
      locals.error = errors.ERR_VALIDATION;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    try {
      locals.room.settings.topic = {
        text: value.topic,
        updatedAt: new Date(),
        updatedBy: locals.user._id,
      };

      locals.room = await locals.room.save();
      locals.success = 'Room settings saved';
      return res.redirect(url.format({
        path: './',
        query: {
          success: locals.success,
        },
      }));
    } catch (err) {
      locals.error = errors.ERR_SRV;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  return res.render('room/settings/info');
}
