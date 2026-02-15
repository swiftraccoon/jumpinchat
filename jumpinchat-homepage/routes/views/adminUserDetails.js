import url from 'url';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import {
  getUserById,
  adminApplyTrophy,
} from '../../utils/userUtils.js';
import { sendBan } from '../../utils/roomUtils.js';
import {
  api,
  errors,
  banReasons,
} from '../../constants/constants.js';
import { Trophy } from '../../models/index.js';

const log = logFactory({ name: 'routes.admin' });

export default async function adminUserDetails(req, res) {
  const { locals } = res;
  const { success, error } = req.query;

  const { userId } = req.params;
  locals.section = `Admin | User ${userId}`;
  locals.page = 'users';
  locals.user = req.user;
  locals.account = {};
  locals.rawAccount = {};
  locals.banReasons = banReasons;
  locals.trophyOptions = [];
  locals.success = success || null;
  locals.error = error || null;

  // Init phase
  let token;
  try {
    token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });
  } catch (err) {
    log.fatal({ err }, 'failed to sign jwt');
    return res.status(500).send(err);
  }

  try {
    locals.trophyOptions = await Trophy.find({});
  } catch (err) {
    log.fatal({ err }, 'failed to fetch trophies');
    return res.status(500).send(err);
  }

  const user = await getUserById(userId, true);
  if (!user) {
    log.error('user not found');
    return res.status(404).send({ error: 'user not found' });
  }

  const settings = {};
  Object.entries(user.settings).forEach(([key, value]) => {
    const newKey = key.replace(/([a-z])([A-Z])/g, '$1 $2');
    settings[newKey] = value ? 'yes' : 'no';
  });

  locals.rawAccount = user;
  locals.account = Object.assign(user, {
    settings,
    attrs: Object.assign(user.attrs, {
      join_date: new Date(user.attrs.join_date).toISOString(),
      last_active: new Date(user.attrs.last_active).toISOString(),
    }),
  });

  // POST: remove
  if (req.method === 'POST' && req.body.action === 'remove') {
    try {
      const response = await axios({
        url: `${api}/api/admin/users/remove/${req.body.userid}`,
        method: 'DELETE',
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to remove user');
        if (response.data && response.data.message) {
          locals.errors = response.data.message;
        } else {
          log.warn('failed to remove user', { body: response.data, code: response.status });
          locals.errors = 'Failed to remove user';
        }
        return res.render('adminUserDetails');
      }

      return res.redirect('/admin/users');
    } catch (err) {
      return res.status(500).send();
    }
  }

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
      if (validationError.name === 'ValidationError') {
        locals.error = 'Invalid request, reason probably missing';
      } else {
        locals.error = 'Verification error';
      }
      return res.render('adminUserDetails');
    }

    const {
      reason,
      duration,
      restrictBroadcast,
      restrictJoin,
    } = validated;

    if (!restrictBroadcast && !restrictJoin) {
      locals.error = 'Select at least one ban type';
      return res.render('adminUserDetails');
    }

    const expire = new Date(Date.now() + (1000 * 60 * 60 * Number(duration)));
    const type = { restrictJoin, restrictBroadcast };

    const { rawAccount: target } = locals;
    const banUser = {
      user_id: target._id,
      ip: target.attrs.last_login_ip,
      restrictBroadcast,
      restrictJoin,
    };

    try {
      locals.success = await sendBan(token, reason, type, banUser, expire);
    } catch (err) {
      log.error({ err }, 'error sending ban request');
      locals.error = err;
    }

    return res.render('adminUserDetails');
  }

  // POST: addtrophy
  if (req.method === 'POST' && req.body.action === 'addtrophy') {
    const { trophy } = req.body;

    try {
      await adminApplyTrophy(token, locals.account._id, trophy);
      locals.success = 'Trophy applied';
      return res.redirect(url.format({
        path: './',
        query: {
          success: locals.success,
        },
      }));
    } catch (err) {
      log.fatal({ err }, 'failed to apply trophy');
      locals.error = errors.ERR_SRV;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  return res.render('adminUserDetails');
}
