import fs from 'fs';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import FormData from 'form-data';
import { isBefore } from 'date-fns';
import logFactory from '../../../utils/logger.js';
import { api } from '../../../constants/constants.js';
import config from '../../../config/index.js';
import { getRoomEmoji } from '../../../utils/roomUtils.js';
import { getUserById } from '../../../utils/userUtils.js';
import { Room } from '../../../models/index.js';

const log = logFactory({ name: 'room.settings' });

function checkUserIsMod(userId, room) {
  const { moderators } = room.settings;

  const isMod = moderators.some((m) => {
    const mod = String(userId) === String(m.user_id);
    const isPerm = String(m.assignedBy) === String(room.attrs.owner) || !m.assignedBy;
    return mod && isPerm;
  });

  const isOwner = String(room.attrs.owner) === String(userId);

  return isMod || isOwner;
}

function roomIsGold(roomOwner) {
  const { isGold, supportExpires } = roomOwner.attrs;
  const supportExpired = !supportExpires || isBefore(new Date(supportExpires), new Date());

  return isGold || !supportExpired;
}

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
  locals.page = 'emoji';
  locals.user = req.user;
  locals.room = null;
  locals.roomOwner = null;
  locals.roomGold = false;
  locals.emoji = [];
  locals.error = error;
  locals.success = success;

  let token;
  // Init phase
  if (locals.user) {
    token = jwt.sign(String(req.user._id), config.auth.jwtSecret);
  }

  try {
    locals.room = await Room.findOne({ name: roomName });

    if (!locals.room || !locals.room.attrs.owner) {
      return res.redirect('/');
    }

    locals.roomOwner = await getUserById(locals.room.attrs.owner);
    locals.roomGold = roomIsGold(locals.roomOwner);
    locals.userIsMod = checkUserIsMod(String(locals.user._id), locals.room);
    locals.emoji = await getRoomEmoji(roomName);
  } catch (err) {
    log.fatal({ err, roomName }, 'failed to fetch room');
    return res.status(500).end();
  }

  // POST: uploadEmoji
  if (req.method === 'POST' && req.body.action === 'uploadEmoji') {
    const schema = Joi.object({
      alias: Joi.string().alphanum().max(12),
    });

    const { error: validationError, value } = schema.validate({ alias: req.body.alias });

    if (validationError) {
      locals.error = 'Required field missing';
      return res.redirect(`?error=${locals.error}`);
    }

    // Handle both multer array style and legacy keyed style
    let imageFile;
    if (Array.isArray(req.files)) {
      imageFile = req.files.find(f => f.fieldname === 'image');
    } else if (req.files) {
      imageFile = req.files.image;
    }

    if (!imageFile) {
      locals.error = 'Image not found';
      return res.redirect(`?error=${locals.error}`);
    }

    try {
      const formData = new FormData();

      if (imageFile.buffer) {
        formData.append('image', imageFile.buffer, {
          filename: imageFile.originalname,
          contentType: imageFile.mimetype,
        });
      } else {
        formData.append('image', fs.createReadStream(imageFile.path), {
          filename: imageFile.originalname || imageFile.name,
          contentType: imageFile.mimetype,
        });
      }

      formData.append('alias', value.alias);
      formData.append('userId', String(locals.user._id));

      const response = await axios({
        url: `${api}/api/rooms/${locals.room.name}/uploadEmoji`,
        method: 'POST',
        data: formData,
        headers: {
          ...formData.getHeaders(),
          authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.error = response.data.message;
          return res.redirect(`?error=${locals.error}`);
        }

        log.warn({ body: response.data, code: response.status }, 'failed upload emoji');
        locals.error = 'Failed to upload image';
        return res.redirect(`?error=${locals.error}`);
      }

      locals.success = 'Emoji uploaded';
      return res.redirect(`?success=${locals.success}`);
    } catch (err) {
      log.fatal({ err }, 'error happened');
      locals.error = 'Failed to upload image';
      return res.redirect(`?error=${locals.error}`);
    }
  }

  // POST: removeEmoji
  if (req.method === 'POST' && req.body.action === 'removeEmoji') {
    const { emojiId } = req.body;

    try {
      const response = await axios({
        url: `${api}/api/rooms/emoji/${emojiId}`,
        method: 'DELETE',
        data: {
          userId: locals.user._id,
          emojiId,
        },
        headers: {
          authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.error = response.data.message;
          return res.redirect(`?error=${locals.error}`);
        }

        log.warn({ body: response.data, code: response.status }, 'failed remove emoji');
        locals.error = 'Failed to remove emoji';
        return res.redirect(`?error=${locals.error}`);
      }

      locals.success = 'Emoji removed';
      return res.redirect(`?success=${locals.success}`);
    } catch (err) {
      log.fatal({ err }, 'error happened');
      locals.error = 'Failed to remove image';
      return res.status(500).send();
    }
  }

  return res.render('room/settings');
}
