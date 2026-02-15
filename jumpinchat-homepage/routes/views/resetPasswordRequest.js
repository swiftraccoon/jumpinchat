import axios from 'axios';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import { errors, api } from '../../constants/constants.js';

const log = logFactory({ name: 'routes.resetPasswordRequest' });

export default async function resetPasswordRequest(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Reset Password';
  locals.user = req.user;
  locals.errors = null;
  locals.success = null;

  // Init phase
  if (locals.user) {
    return res.redirect('/settings/account');
  }

  // POST handling
  if (req.method === 'POST' && req.body.action === 'requestResetPassword') {
    const schema = Joi.object({
      username: Joi.string().alphanum().required(),
    });

    const { error, value: validated } = schema.validate({
      username: req.body.username,
    }, { abortEarly: false });

    if (error) {
      locals.errors = errors.ERR_VALIDATION;
      return res.render('resetPasswordRequest');
    }

    const { username } = validated;

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/user/password/request`,
        data: { username },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.errors = response.data.message;
        } else {
          locals.errors = 'Failed to send password reset email';
        }
      } else {
        locals.success = 'A password reset code has been sent to your email address';
      }
    } catch (err) {
      log.fatal({ err }, 'error calling password reset endpoint');
      return res.status(500).send();
    }
  }

  // Render the view
  return res.render('resetPasswordRequest');
}
