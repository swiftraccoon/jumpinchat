import Joi from 'joi';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import {
  api,
  errors,
} from '../../../constants/constants.js';

const log = logFactory({ name: 'routes.roomCloseDetail' });

export default async function adminCommunication(req, res) {
  const { locals } = res;
  const { success, error, page = 1 } = req.query;

  locals.section = 'Admin | Communication';
  locals.page = 'communication';
  locals.user = req.user;
  locals.error = error || null;
  locals.success = success || null;

  // Init phase
  let token;
  try {
    token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });
  } catch (err) {
    log.fatal({ err }, 'failed to create token');
    return res.status(500).send(err);
  }

  // POST: message
  if (req.method === 'POST' && req.body.action === 'message') {
    const schema = Joi.object({
      message: Joi.string().required(),
    });

    const { error: validationError, value } = schema.validate({
      message: req.body.message,
    }, { abortEarly: false });

    if (validationError) {
      log.warn({ err: validationError }, 'invalid message');
      locals.errors = errors.ERR_VALIDATION;
      return res.render('admin/communication');
    }

    log.debug({ message: value.message, body: req.body });

    try {
      const response = await axios({
        method: 'POST',
        url: `${api}/api/message/admin/send`,
        headers: {
          Authorization: token,
        },
        data: {
          message: value.message,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        if (response.data && response.data.message) {
          locals.error = response.data.message;
        } else {
          log.error({ statusCode: response.status }, 'error sending email');
          locals.error = 'error happened';
        }
        return res.render('admin/communication');
      }

      locals.success = 'Message sent successfully';
      return res.redirect(`/admin/communication?success=${locals.success}`);
    } catch (err) {
      log.error({ err }, 'error happened');
      locals.error = 'error happened';
      return res.render('admin/communication');
    }
  }

  return res.render('admin/communication');
}
