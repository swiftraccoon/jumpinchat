import axios from 'axios';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import { errors, api } from '../../constants/constants.js';

const log = logFactory({ name: 'routes.contact' });

export default async function contact(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Contact';
  locals.user = req.user;
  locals.error = null;
  locals.success = null;

  if (req.method === 'POST' && req.body.action === 'send') {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      option: Joi.string().required(),
      name: Joi.string().allow(''),
      message: Joi.string().required(),
      phone6tY4bPYk: Joi.any().valid('').strip(),
    });

    const { error, value: validatedForm } = schema.validate({
      email: req.body.email,
      option: req.body.option,
      name: req.body.name,
      message: req.body.message,
      phone6tY4bPYk: req.body.phone6tY4bPYk,
    }, { abortEarly: false });

    if (error) {
      log.warn({ err: error.name }, 'invalid contact form information');
      locals.error = errors.ERR_VALIDATION;
    } else {
      try {
        const response = await axios({
          method: 'POST',
          url: `${api}/api/user/contact`,
          data: validatedForm,
          validateStatus: () => true,
        });

        if (response.status >= 400) {
          if (response.data && response.data.message) {
            locals.error = response.data.message;
          } else {
            locals.error = 'Failed to send message, sorry!';
          }
        } else {
          locals.success = 'Message sent!';
        }
      } catch (err) {
        log.error({ err }, 'error happened');
        return res.status(500).send();
      }
    }
  }

  // Render the view
  return res.render('contact');
}
