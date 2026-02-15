import url from 'url';
import bcrypt from 'bcrypt';
import axios from 'axios';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import { isAfter, format } from 'date-fns';
import logFactory from '../../../utils/logger.js';
import { errors, successMessages, api } from '../../../constants/constants.js';
import request from '../../../utils/request.js';
import config from '../../../config/index.js';
import {
  generatePassHash,
} from '../../../utils/userUtils.js';
import { User } from '../../../models/index.js';

const log = logFactory({ name: 'settings.account' });

async function getSubscription(userId) {
  const token = jwt.sign(String(userId), config.auth.jwtSecret);
  try {
    const response = await axios({
      url: `${api}/api/payment/subscribed/${userId}`,
      method: 'GET',
      headers: {
        Authorization: token,
      },
      validateStatus: () => true,
    });

    if (response.status === 404) {
      return undefined;
    }

    if (response.status >= 400) {
      log.error({ statusCode: response.status }, 'error fetching subscription');
      if (response.data && response.data.message) {
        throw new Error(response.data.message);
      }
      throw new Error(errors.ERR_SRV);
    }

    return response.data;
  } catch (err) {
    log.error({ err }, 'error fetching subscription');
    throw err;
  }
}

export default async function accountSettings(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.page = 'account';
  locals.section = 'Settings | Account';
  locals.user = req.user;
  locals.room = null;
  locals.error = req.query.error || null;
  locals.success = req.query.success || null;
  locals.brandMap = {
    MasterCard: 'mastercard',
    Visa: 'visa',
  };
  locals.supportExpires = null;

  // Init phase
  if (!locals.user) {
    return res.redirect('/');
  }

  const token = jwt.sign(String(req.user._id), config.auth.jwtSecret);
  const { supportExpires } = locals.user.attrs;
  if (supportExpires && isAfter(new Date(supportExpires), new Date())) {
    locals.supportExpires = format(new Date(supportExpires), "yyyy-MM-dd'T'HH:mm:ssxxx");
  }

  try {
    locals.subscription = await getSubscription(locals.user._id);
    log.debug({ subscription: locals.subscription });
  } catch (err) {
    log.fatal({ err }, 'error fetching subscription');
    locals.error = 'Error fetching subscription';
  }

  // POST: account (change password)
  if (req.method === 'POST' && req.body.action === 'account') {
    const schema = Joi.object({
      passwordNew: Joi.string().required(),
      passwordNewConfirm: Joi.string().required(),
      passwordCurrent: Joi.string().required(),
    });

    const { error, value: validatedLogin } = schema.validate({
      passwordNew: req.body.passwordNew,
      passwordNewConfirm: req.body.passwordNewConfirm,
      passwordCurrent: req.body.passwordCurrent,
    }, { abortEarly: false });

    if (error) {
      log.warn({ err: error }, 'invalid login details');
      locals.error = errors.ERR_VALIDATION;
      return res.render('settings/account');
    }

    try {
      const doesMatch = await bcrypt.compare(validatedLogin.passwordCurrent, locals.user.auth.passhash);
      if (!doesMatch) {
        locals.error = errors.ERR_PASS_INVALID;
        return res.render('settings/account');
      }

      if (validatedLogin.passwordNew !== validatedLogin.passwordNewConfirm) {
        locals.error = errors.ERR_PASS_NO_MATCH;
        return res.render('settings/account');
      }

      const user = await User.findOne({ _id: locals.user._id });
      if (!user) {
        log.fatal('failed to find user');
        locals.error = errors.ERR_SRV;
        return res.render('settings/account');
      }

      const newPassHash = await new Promise((resolve, reject) => {
        generatePassHash(validatedLogin.passwordNew, (err, hash) => {
          if (err) return reject(err);
          return resolve(hash);
        });
      });

      user.auth.passhash = newPassHash;
      await user.save();

      locals.success = successMessages.MSG_SETTINGS_UPDATED;
    } catch (err) {
      log.fatal({ err }, 'error during password change');
      locals.error = errors.ERR_SRV;
    }

    return res.render('settings/account');
  }

  // POST: email
  if (req.method === 'POST' && req.body.action === 'email') {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    });

    const { error, value: validated } = schema.validate({
      email: req.body.email,
      password: req.body.passwordEmail,
    }, { abortEarly: false });

    if (error) {
      log.warn({ err: error }, 'invalid email change details');
      locals.error = errors.ERR_VALIDATION;
      return res.render('settings/account');
    }

    try {
      const response = await axios({
        url: `${api}/api/user/${locals.user._id}/changeEmail`,
        method: 'PUT',
        headers: {
          Authorization: token,
        },
        data: validated,
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          locals.error = errors.ERR_SRV;
        }
      } else {
        locals.success = successMessages.MSG_SETTINGS_UPDATED;
      }
    } catch (err) {
      log.error({ err }, 'error changing user email');
      locals.error = errors.ERR_SRV;
    }

    return res.render('settings/account');
  }

  // POST: removeSubscription
  if (req.method === 'POST' && req.body.action === 'removeSubscription') {
    try {
      const response = await axios({
        url: `${api}/api/payment/subscription/${locals.user._id}`,
        method: 'DELETE',
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to remove subscription');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.warn('failed to remove subscription', { body: response.data, code: response.status });
          locals.error = 'Failed to cancel subscription';
        }
      } else {
        locals.subscription = null;
        locals.success = 'Cancelled subscription, thanks for supporting JumpInChat!';
      }
    } catch (err) {
      return res.status(500).send();
    }

    return res.render('settings/account');
  }

  // POST: updatePayment
  if (req.method === 'POST' && req.body.action === 'updatePayment') {
    locals.error = null;

    try {
      const response = await axios({
        url: `${api}/api/payment/source/update/${locals.user._id}`,
        method: 'PUT',
        data: req.body,
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to update payment method');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.warn('failed to update payment method', { body: response.data, code: response.status });
          locals.error = 'Failed to update payment method';
        }
      } else {
        locals.subscription = null;
        locals.success = 'Payment method succesfully updated';
      }
    } catch (err) {
      log.fatal({ err }, 'failed to update payment source');
      return res.status(500).send();
    }

    return res.render('settings/account');
  }

  // POST: removeuser
  if (req.method === 'POST' && req.body.action === 'removeuser') {
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
        url: `${api}/api/user/${locals.user._id}/remove`,
        method: 'DELETE',
        headers: {
          Authorization: token,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        log.warn({ body: response.data, status: response.status }, 'failed to remove user');
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.warn('failed to remove user', { body: response.data, code: response.status });
          locals.error = 'Failed to remove user';
        }
        return res.render('settings/account');
      }

      return res.redirect('/');
    } catch (err) {
      log.fatal({ err }, 'error calling remove user endpoint');
      return res.status(500).send();
    }
  }

  // POST: disableTotp
  if (req.method === 'POST' && req.body.action === 'disableTotp') {
    try {
      await request({
        url: `${api}/api/user/mfa/disable`,
        method: 'put',
        headers: {
          Authorization: token,
        },
      });

      locals.success = 'Mfa disabled';

      return res.redirect(url.format({
        path: './',
        query: {
          success: locals.success,
        },
      }));
    } catch (err) {
      if (!err.message) {
        locals.error = err;
      } else {
        locals.error = 'failed to confirm enrollment';
      }

      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  return res.render('settings/account');
}
