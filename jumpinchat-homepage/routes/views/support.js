import url from 'url';
import Joi from 'joi';
import { products, errors } from '../../constants/constants.js';

export default async function support(req, res) {
  const { locals } = res;
  const { error } = req.query;

  locals.page = req.params.page;
  locals.section = 'Support the site';
  locals.description = 'Support JumpInChat by becoming a site supporter! Help keep the site running and get exclusive supporter perks!';
  locals.user = req.user;
  locals.products = products;
  locals.error = error || null;

  if (req.method === 'POST' && req.body.action === 'custom') {
    const schema = Joi.object({
      amount: Joi.number().integer().min(3).max(50),
    });

    const { error: validationError, value } = schema.validate({ amount: req.body.amount });

    if (validationError) {
      locals.error = errors.ERR_VALIDATION;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    return res.redirect(`/support/payment?productId=onetime&amount=${value.amount * 100}`);
  }

  return res.render('support');
}
