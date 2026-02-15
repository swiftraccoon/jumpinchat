import url from 'url';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import { getReportById, setReportResolved } from '../../../utils/reportUtils.js';
import { getUserById } from '../../../utils/userUtils.js';
import { sendBan, getRoomById } from '../../../utils/roomUtils.js';
import { banReasons, reportOutcomes, errors } from '../../../constants/constants.js';

const log = logFactory({ name: 'routes.sitemod.reportDetails' });

export default async function sitemodReportDetails(req, res) {
  const { locals } = res;
  const {
    success,
    error,
  } = req.query;

  const { reportId } = req.params;
  locals.error = error || null;
  locals.success = success || null;
  locals.section = `Site Mod | Report ${reportId}`;
  locals.page = 'reports';
  locals.user = req.user;
  locals.report = {};
  locals.banReasons = banReasons;
  locals.reportOutcomes = reportOutcomes;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  let initResult;
  await new Promise((resolve) => {
    getReportById(token, reportId, async (err, report) => {
      if (err) {
        log.fatal({ err }, 'error getting report');
        initResult = 'error';
        return resolve();
      }

      if (!report) {
        log.error('report not found');
        initResult = 'notfound';
        return resolve();
      }

      locals.report = report;

      try {
        const room = await getRoomById(report.room.roomId);
        locals.report.room.isAgeRestricted = room.attrs.ageRestricted;
      } catch (roomErr) {
        log.fatal({ err: roomErr }, 'failed to get report room details');
      }

      if (report.reporter.userId) {
        try {
          const { username } = await getUserById(report.reporter.userId);
          locals.reporterUsername = username;
        } catch (userErr) {
          log.fatal({ err: userErr }, 'failed to fetch user');
        }
      }

      if (report.target.userId) {
        try {
          const { username } = await getUserById(report.target.userId);
          locals.targetUsername = username;
        } catch (userErr) {
          log.fatal({ err: userErr }, 'failed to fetch user');
        }
      }

      return resolve();
    });
  });

  if (initResult === 'error') return res.status(500).send({ error: 'error getting report' });
  if (initResult === 'notfound') return res.status(404).send({ error: 'report not found' });

  // POST: siteban
  if (req.method === 'POST' && req.body.action === 'siteban') {
    locals.error = null;
    const schema = Joi.object({
      reason: Joi.string().required(),
      duration: Joi.number().required(),
      type: Joi.string().required(),
    });

    const requestBody = {
      reason: req.body.reason,
      duration: req.body.duration,
      type: req.body.type,
    };

    const { error: validationError, value: validated } = schema.validate(requestBody);

    if (validationError) {
      log.error({ err: validationError }, 'validation error');
      if (validationError.name === 'ValidationError') {
        locals.error = 'Invalid request, reason probably missing';
      } else {
        locals.error = 'Verification error';
      }
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    const {
      reason,
      duration,
      type,
    } = validated;

    const expire = new Date(Date.now() + (1000 * 60 * 60 * Number(duration)));

    const { target } = locals.report;
    const banUser = {
      user_id: target.userId,
      session_id: target.sessionId,
      ip: target.ip,
      socket_id: target.socketId,
    };

    const banType = {
      restrictBroadcast: type === 'broadcast',
      restrictJoin: type === 'join',
    };

    try {
      locals.success = await sendBan(token, reason, banType, banUser, expire, reportId);
      return res.redirect(url.format({
        path: './',
        query: {
          success: locals.success,
        },
      }));
    } catch (err) {
      log.error({ err }, 'error sending ban request');
      locals.error = err;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }
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

  return res.render('sitemod/reportDetails');
}
