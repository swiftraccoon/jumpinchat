import axios from 'axios';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import { errors, api } from '../../constants/constants.js';

const log = logFactory({ name: 'routes.resetPassword' });

export default async function resetPassword(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Reset Password';
  locals.user = req.user;
  locals.errors = null;
  locals.success = null;
  locals.verified = false;
  locals.userId = null;

  // Init phase - verify the reset token
  try {
    const verifyResponse = await axios({
      method: 'GET',
      url: `${api}/api/user/password/reset/${req.params.token}`,
      validateStatus: () => true,
    });

    if (verifyResponse.status >= 400) {
      if (verifyResponse.data && verifyResponse.data.message) {
        locals.errors = verifyResponse.data.message;
      } else {
        locals.errors = 'Unable to verify reset token :(';
      }
    } else {
      locals.verified = true;
      locals.userId = verifyResponse.data.userId;
    }
  } catch (err) {
    log.error({ err }, 'error happened');
    return res.status(500).send();
  }

  // POST handling
  if (req.method === 'POST' && req.body.action === 'resetPassword') {
    const schema = Joi.object({
      password: Joi.string().required(),
      passwordRepeat: Joi.string().required(),
    });

    const { password, passwordRepeat } = req.body;

    const { error, value: validated } = schema.validate({
      password,
      passwordRepeat,
    }, { abortEarly: false });

    if (error) {
      locals.errors = errors.ERR_VALIDATION;
      return res.render('resetPassword');
    }

    if (validated.password !== validated.passwordRepeat) {
      locals.errors = 'Passwords do not match';
      return res.render('resetPassword');
    }

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/user/password/reset`,
        data: { password: validated.password, userId: locals.userId },
        validateStatus: () => true,
      });

      log.debug('response', response.status);

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.errors = response.data.message;
        } else {
          locals.errors = 'Failed to reset password';
        }
      } else {
        locals.success = 'Your password has been reset';
      }
    } catch (err) {
      log.error('error happened', err);
      return res.status(500).send();
    }
  }

  // Render the view
  return res.render('resetPassword');
}
