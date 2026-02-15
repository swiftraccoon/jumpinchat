import url from 'url';
import jwt from 'jsonwebtoken';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import {
  getSiteMods,
  addSiteMod,
  removeSiteMod,
} from '../../../utils/adminUtils.js';

const log = logFactory({ name: 'routes.admin.siteMods' });

export default async function adminSiteMods(req, res) {
  const { locals } = res;
  const {
    success,
    error,
  } = req.query;

  locals.section = 'Admin | Site mods';
  locals.page = 'sitemods';
  locals.user = req.user;
  locals.roomCloses = [];
  locals.error = error || null;
  locals.success = success || null;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  try {
    locals.siteMods = await getSiteMods(token);
  } catch (err) {
    log.fatal({ err }, 'failed to fetch site mods');
    return res.status(500).send();
  }

  // POST: add-mod
  if (req.method === 'POST' && req.body.action === 'add-mod') {
    const { username } = req.body;
    try {
      await addSiteMod(token, username);
      return res.redirect(url.format({
        path: './',
        query: {
          success: 'site mod added',
        },
      }));
    } catch (err) {
      log.fatal({ err }, 'failed to add site mod');
      locals.error = err;

      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  // POST: remove-mod
  if (req.method === 'POST' && req.body.action === 'remove-mod') {
    const { modId } = req.body;
    log.debug({ modId }, 'remove-mod');
    try {
      await removeSiteMod(token, modId);
      return res.redirect(url.format({
        path: './',
        query: {
          success: 'site mod removed',
        },
      }));
    } catch (err) {
      log.fatal({ err }, 'failed to remove site mod');
      locals.error = err;

      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  return res.render('admin/siteMods');
}
