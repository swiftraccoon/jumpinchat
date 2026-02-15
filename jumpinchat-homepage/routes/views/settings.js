/**
 * Created by Zaccary on 19/03/2017.
 */

import fs from 'fs';
import url from 'url';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import bcrypt from 'bcrypt';
import { isAfter } from 'date-fns';
import { formatRelative } from 'date-fns';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { getRoomByName } from '../../utils/roomUtils.js';
import {
  errors,
  successMessages,
  api,
  videoQuality,
} from '../../constants/constants.js';
import {
  getUserByUsername,
  getUserById,
  generatePassHash,
} from '../../utils/userUtils.js';
import { User } from '../../models/index.js';

const log = logFactory({ name: 'settings view' });

export default async function settings(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.page = req.params.page;
  locals.section = `Settings | ${locals.page}`;
  locals.user = req.user;
  locals.room = null;
  locals.error = req.query.error || null;
  locals.success = req.query.success || null;
  locals.isGold = false;
  locals.supportExpires = null;
  locals.videoQuality = videoQuality;

  const pages = [
    'account',
    'profile',
    'room',
    'user',
  ];

  // Init phase
  if (!locals.user) {
    return res.redirect('/');
  }

  if (!locals.page) {
    return res.redirect('/settings/profile');
  }

  if (pages.indexOf(locals.page) < 0) {
    return res.redirect('/settings/profile');
  }

  const token = jwt.sign(String(req.user._id), config.auth.jwtSecret);
  const { supportExpires } = locals.user.attrs;
  const isGold = locals.user.attrs.isGold
    || (supportExpires && isAfter(new Date(supportExpires), new Date()));

  locals.isGold = isGold;
  if (supportExpires && isAfter(new Date(supportExpires), new Date())) {
    locals.supportExpires = formatRelative(new Date(supportExpires), new Date());
  }

  const room = await getRoomByName(locals.user.username);
  if (!room) {
    return res.redirect('/');
  }
  locals.room = room;

  // POST: profile
  if (req.method === 'POST' && req.body.action === 'profile') {
    const schema = Joi.object({
      dobMonth: Joi.number().integer().min(1).max(12),
      dobDay: Joi.number().integer().min(1).max(31),
      bio: Joi.string().allow(''),
      location: Joi.string().max(50).allow(''),
    });

    const { error, value: validated } = schema.validate({
      dobMonth: req.body.dobMonth,
      dobDay: req.body.dobDay,
      bio: req.body.bio,
      location: req.body.location,
    }, { abortEarly: false });

    if (error) {
      if (error.name === 'ValidationError') {
        log.warn({ err: error });
        locals.errors = errors.ERR_VALIDATION;
      } else {
        log.fatal({ err: error });
        locals.errors = errors.ERR_SRV;
      }
      return res.render('settings');
    }

    if (validated.dobMonth && validated.dobDay) {
      const testDate = new Date(1970, validated.dobMonth - 1, validated.dobDay);
      const dateValid = !isNaN(testDate.getTime())
        && testDate.getMonth() === validated.dobMonth - 1;

      if (!dateValid) {
        locals.error = 'Invalid date';
        return res.render('settings');
      }
    }

    try {
      const user = await User.findOne({ _id: locals.user._id });
      if (!user) {
        locals.error = errors.ERR_SRV;
        return res.render('settings');
      }

      user.profile = Object.assign({}, user.profile, {
        bio: validated.bio,
        location: validated.location,
        dob: {
          month: validated.dobMonth,
          day: validated.dobDay,
        },
      });

      const updatedUser = await user.save();
      locals.user = updatedUser;
      locals.success = successMessages.MSG_SETTINGS_UPDATED;
    } catch (err) {
      locals.error = errors.ERR_SRV;
    }

    return res.render('settings');
  }

  // POST: room
  if (req.method === 'POST' && req.body.action === 'room') {
    const schema = Joi.object({
      public: Joi.boolean(),
      forcePtt: Joi.boolean(),
      requireVerifiedEmail: Joi.boolean(),
      forceUser: Joi.boolean(),
      minAccountAge: Joi.number().allow(''),
      description: Joi.string().max(140).allow(''),
    });

    const { error, value: validated } = schema.validate({
      public: req.body.public,
      description: req.body.description,
      forcePtt: req.body.forcePtt,
      forceUser: req.body.forceUser,
      requireVerifiedEmail: req.body.requireVerifiedEmail,
      minAccountAge: req.body.minAccountAge,
    });

    if (error) {
      if (error.name === 'ValidationError') {
        log.warn({ err: error });
        locals.error = errors.ERR_VALIDATION;
      } else {
        log.fatal({ err: error });
        locals.error = errors.ERR_SRV;
      }
      return res.render('settings');
    }

    locals.room.settings.public = validated.public;
    locals.room.settings.description = validated.description;
    locals.room.settings.forcePtt = validated.forcePtt;
    locals.room.settings.forceUser = validated.forceUser;

    locals.room.settings.minAccountAge = validated.minAccountAge === ''
      ? null
      : validated.minAccountAge;

    if (locals.room.settings.minAccountAge && !locals.room.settings.forceUser) {
      locals.room.settings.forceUser = true;
    }

    locals.room.settings.requireVerifiedEmail = validated.requireVerifiedEmail;
    if (locals.room.settings.requireVerifiedEmail && !locals.room.settings.forceUser) {
      locals.room.settings.forceUser = true;
    }

    try {
      const savedRoom = await locals.room.save();
      locals.success = 'Room settings updated';
      locals.room = savedRoom;
    } catch (err) {
      log.fatal('error saving room', err);
      return res.status(500).send();
    }

    return res.render('settings');
  }

  // POST: roompass
  if (req.method === 'POST' && req.body.action === 'roompass') {
    const schema = Joi.object({
      password: Joi.string().allow(''),
    });

    const { error, value } = schema.validate({ password: req.body.password });

    if (error) {
      if (error.name === 'ValidationError') {
        log.error({ err: error }, 'validation error');
        locals.error = errors.ERR_VALIDATION;
        return res.render('settings');
      }
      log.fatal({ err: error }, 'error');
      return res.status(500).send(errors.ERR_SRV);
    }

    const { password } = value;

    if (!password.length) {
      log.debug('no password');
      locals.room.settings.passhash = null;
      try {
        locals.room = await locals.room.save();
        locals.success = 'Room password saved';
      } catch (err) {
        log.fatal({ err }, 'failed to save room password');
        locals.error = errors.ERR_SRV;
        return res.status(500).send(errors.ERR_SRV);
      }
      return res.render('settings');
    }

    // generatePassHash is callback-based
    const passhash = await new Promise((resolve, reject) => {
      generatePassHash(password, (err, hash) => {
        if (err) return reject(err);
        return resolve(hash);
      });
    }).catch((err) => {
      locals.error = errors.ERR_SRV;
      return null;
    });

    if (!passhash) {
      return res.render('settings');
    }

    locals.room.settings.passhash = passhash;

    try {
      locals.room = await locals.room.save();
      locals.success = 'Room password saved';
    } catch (err) {
      log.fatal({ err }, 'failed to save room password');
      locals.error = errors.ERR_SRV;
      return res.status(500).send(errors.ERR_SRV);
    }

    return res.render('settings');
  }

  // POST: setAgeRestricted
  if (req.method === 'POST' && req.body.action === 'setAgeRestricted') {
    const { passhash } = req.user.auth;
    const { password } = req.body;

    if (!password) {
      return res.redirect(url.format({
        path: './',
        query: {
          error: 'Password is required',
        },
      }));
    }

    try {
      const result = await bcrypt.compare(password, passhash);
      if (!result) {
        return res.redirect(url.format({
          path: './',
          query: {
            error: 'Password is incorrect',
          },
        }));
      }
    } catch (err) {
      log.fatal({ err }, 'error checking passwords');
      return res.status(500).send();
    }

    try {
      const response = await axios({
        url: `${api}/api/rooms/${locals.room.name}/setAgeRestricted`,
        method: 'PUT',
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to save room settings');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
          return res.render('settings');
        }

        log.warn('failed to save room settings', { body: response.data, code: response.status });
        return res.redirect(url.format({
          path: './',
          query: {
            success: 'Failed to save room settings',
          },
        }));
      }

      return res.redirect(url.format({
        path: './',
        query: {
          success: 'Room settings updated',
        },
      }));
    } catch (err) {
      log.fatal({ err }, 'error happened');
      locals.error = 'Failed save room settings';
      return res.status(500).send();
    }
  }

  // POST: user settings
  if (req.method === 'POST' && req.body.action === 'user') {
    const {
      playYtVideos,
      allowPrivateMessages,
      pushNotificationsEnabled,
      receiveUpdates,
      receiveMessageNotifications,
      darkTheme,
    } = req.body;

    try {
      const response = await axios({
        url: `${api}/api/user/${locals.user._id}/settings`,
        method: 'POST',
        headers: {
          Authorization: token,
        },
        data: {
          playYtVideos,
          allowPrivateMessages,
          pushNotificationsEnabled,
          receiveUpdates,
          receiveMessageNotifications,
          darkTheme,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to save user settings');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.warn('failed to save user settings', { body: response.data, code: response.status });
          locals.error = 'Failed to save user settings';
        }
        return res.render('settings');
      }

      const user = await getUserById(locals.user._id, true);
      if (!user) {
        log.warn('could not find user');
        return res.redirect('/');
      }

      locals.user = user;
      locals.success = 'User settings saved';
    } catch (err) {
      log.fatal({ err }, 'error happened');
      locals.error = 'Failed to save user settings';
      return res.status(500).send();
    }

    return res.render('settings');
  }

  // POST: userListIcon
  if (req.method === 'POST' && req.body.action === 'userListIcon') {
    const { files } = req;
    const imageFile = Array.isArray(files) ? files.find(f => f.fieldname === 'image') : files && files.image;
    if (!imageFile) {
      locals.error = 'Image not found';
      return res.render('settings');
    }

    try {
      const FormData = (await import('form-data')).default;
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

      const response = await axios({
        url: `${api}/api/user/${locals.user._id}/uploadUserIcon`,
        method: 'PUT',
        data: formData,
        headers: {
          ...formData.getHeaders(),
          authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to upload user icon');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.warn({ body: response.data, code: response.status }, 'failed upload user icon');
          locals.error = 'Failed to upload image';
        }
      } else {
        locals.success = 'User icon uploaded';
      }
    } catch (err) {
      log.fatal({ err }, 'error happened');
      locals.error = 'Failed to upload image';
      return res.status(500).send();
    }

    return res.render('settings');
  }

  // POST: ignore
  if (req.method === 'POST' && req.body.action === 'ignore') {
    const schema = Joi.object({
      username: Joi.string(),
    });

    const { error, value: validated } = schema.validate({ username: req.body.username });

    if (error) {
      log.warn(error);
      locals.error = errors.ERR_VALIDATION;
      return res.render('settings');
    }

    if (locals.room.settings.moderators.find(mod => mod.username === validated.username)) {
      return res.render('settings');
    }

    try {
      const user = await getUserByUsername(validated.username.toLowerCase());
      if (!user) {
        locals.error = 'User name not found';
        return res.render('settings');
      }

      const userIgnored = locals.user.settings.ignoreList
        .find(u => String(u.userId) === String(user._id));

      if (userIgnored) {
        locals.error = 'User already ignored';
        return res.render('settings');
      }

      locals.user.settings.ignoreList = [
        ...locals.user.settings.ignoreList,
        {
          handle: user.username,
          timestamp: Date.now(),
          userId: user._id,
        },
      ];

      const savedUser = await locals.user.save();
      locals.user = savedUser;
      locals.success = 'User settings saved';
    } catch (err) {
      log.fatal({ err }, 'error saving room');
      return res.status(500).send();
    }

    return res.render('settings');
  }

  // POST: videoQuality
  if (req.method === 'POST' && req.body.action === 'videoQuality') {
    const { quality } = req.body;

    try {
      const user = await getUserById(locals.user._id, false);
      user.settings.videoQuality = quality;
      locals.user = await user.save();
      locals.success = 'User settings saved';
    } catch (err) {
      log.fatal({ err }, 'failed to retrieve user');
      return res.status(500).send();
    }

    return res.render('settings');
  }

  return res.render('settings');
}
