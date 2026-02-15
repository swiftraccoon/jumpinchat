import url from 'url';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import { getReportById, setReportResolved } from '../../utils/reportUtils.js';
import {
  sendBan,
} from '../../utils/roomUtils.js';
import {
  banReasons,
  reportOutcomes,
  errors,
} from '../../constants/constants.js';

const log = logFactory({ name: 'routes.adminReportDetails' });

export default async function adminReportDetails(req, res) {
  const { locals } = res;
  const {
    success,
    error,
  } = req.query;

  const { reportId } = req.params;
  locals.error = error || null;
  locals.success = success || null;
  locals.section = `Admin | Report ${reportId}`;
  locals.page = 'reports';
  locals.user = req.user;
  locals.report = {};
  locals.banReasons = banReasons;
  locals.reportOutcomes = reportOutcomes;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  await new Promise((resolve) => {
    getReportById(token, reportId, (err, report) => {
      if (err) {
        log.fatal({ err }, 'error getting report');
        return resolve('error');
      }

      if (!report) {
        log.error('report not found');
        return resolve('notfound');
      }

      locals.report = report;
      return resolve();
    });
  }).then((result) => {
    if (result === 'error') return res.status(500).send({ error: 'error getting report' });
    if (result === 'notfound') return res.status(404).send({ error: 'report not found' });
    return null;
  });

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
      return res.render('adminReportDetails');
    }

    const {
      reason,
      duration,
      restrictBroadcast,
      restrictJoin,
    } = validated;

    if (!restrictBroadcast && !restrictJoin) {
      locals.error = 'Select at least one ban type';
      return res.render('adminReportDetails');
    }

    const expire = new Date(Date.now() + (1000 * 60 * 60 * Number(duration)));

    const { target } = locals.report;
    const banUser = {
      user_id: target.userId,
      session_id: target.sessionId,
      ip: target.ip,
      restrictBroadcast,
      restrictJoin,
      socket_id: target.socketId,
    };

    const type = { restrictJoin, restrictBroadcast };
    try {
      locals.success = await sendBan(token, reason, type, banUser, expire, reportId);
    } catch (err) {
      log.error({ err }, 'error sending ban request');
      locals.error = err;
    }

    return res.render('adminReportDetails');
  }

  // POST: resolve
  if (req.method === 'POST' && req.body.action === 'resolve') {
    try {
      await setReportResolved(token, reportId);
      return res.redirect(url.format({
        path: './',
        query: {
          success: 'Report resolved',
        },
      }));
    } catch (err) {
      locals.error = err.message || err || errors.ERR_SRV;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
  }

  return res.render('adminReportDetails');
}
