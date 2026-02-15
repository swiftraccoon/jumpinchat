import jwt from 'jsonwebtoken';
import Joi from 'joi';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import { getMessageReportById } from '../../../utils/reportUtils.js';
import { sendBan } from '../../../utils/roomUtils.js';
import { banReasons } from '../../../constants/constants.js';

const log = logFactory({ name: 'routes.messageReportDetails' });

export default async function messageReportDetails(req, res) {
  const { locals } = res;

  const { reportId } = req.params;
  locals.section = `Admin | Message Report ${reportId}`;
  locals.page = 'messageReports';
  locals.user = req.user;
  locals.report = {};
  locals.banReasons = banReasons;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  await new Promise((resolve) => {
    getMessageReportById(token, reportId, (err, report) => {
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
      restrictBroadcast: Joi.boolean().truthy('on'),
      restrictJoin: Joi.boolean().truthy('on'),
    });

    const requestBody = {
      reason: req.body.reason,
      restrictBroadcast: req.body.restrictBroadcast === 'on',
      restrictJoin: req.body.restrictJoin === 'on',
    };

    log.debug({ requestBody });

    const { error, value: validated } = schema.validate(requestBody);

    if (error) {
      log.error({ err: error }, 'validation error');
      if (error.name === 'ValidationError') {
        locals.error = 'Invalid request, reason probably missing';
      } else {
        locals.error = 'Verification error';
      }
      return res.render('admin/messageReportDetails');
    }

    const {
      reason,
      restrictBroadcast,
      restrictJoin,
    } = validated;

    log.debug({
      reason,
      restrictBroadcast,
      restrictJoin,
    }, 'validated');

    if (!restrictBroadcast && !restrictJoin) {
      locals.error = 'Select at least one ban type';
      return res.render('admin/messageReportDetails');
    }

    const { sender } = locals.report.message;
    const banUser = {
      user_id: sender,
      restrictBroadcast,
      restrictJoin,
    };

    try {
      locals.success = await sendBan(token, reason, { restrictJoin, restrictBroadcast }, banUser);
    } catch (err) {
      log.error({ err }, 'error sending ban request');
      locals.error = err;
    }

    return res.render('admin/messageReportDetails');
  }

  return res.render('admin/messageReportDetails');
}
