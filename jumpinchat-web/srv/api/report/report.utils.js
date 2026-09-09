import { formatDistance } from 'date-fns';
import logFactory from '../../utils/logger.util.js';
import config from '../../config/env/index.js';
import email from '../../config/email.config.js';
import Queue from '../../utils/queue.util.js';
import redisFactory from '../../lib/redis.util.js';
import reportModel from './report.model.js';
import adminUtils from '../admin/admin.utils.js';
import adminConstants from '../admin/admin.constants.js';
import userUtils from '../user/user.utils.js';
const log = logFactory({ name: 'report.utils' });
const redis = redisFactory();
import { reportTemplate, siteModReportTemplate } from '../../config/constants/emailTemplates.js';

function getLimiterKey(sessionId) {
  return `reportLimit:${sessionId}`;
}

export function getReportById(reportId) {
  return reportModel.findOne({ _id: reportId }).exec();
};

export async function incrementReport(session, cb) {
  const key = getLimiterKey(session);

  let current;
  try {
    current = await redis.get(key);
  } catch (err) {
    return cb(err);
  }

  if (current && current >= config.report.limit) {
    let ttl;
    try {
      ttl = await redis.ttl(key);
    } catch (err) {
      log.fatal({ err }, 'failed to get TTL');
      return cb(err);
    }

    log.warn('User has hit report limit');
    return cb({
      name: 'ERR_LIMIT',
      ttl,
    });
  }

  try {
    await redis.incr(key);
    await redis.expire(key, config.report.limitExpire);
  } catch (err) {
    return cb(err);
  }

  return cb();
};

export function getTimeLeft(ttl) {
  return formatDistance(0, ttl * 1000, { includeSeconds: true });
};

export async function sendReportMessages(body, roomName) {
  const queue = new Queue(email.sendMail, 100);

  queue.on('done', () => {
    log.debug('email send queue complete');
  });

  let mods;
  try {
    mods = await userUtils.getSiteMods();
  } catch (err) {
    log.fatal({ err }, 'failed to get site mods');
    throw err;
  }

  mods.forEach((mod) => {
    const cb = (err) => {
      if (err) {
        log.error({ err, username: mod.username }, 'error sending email');
        return;
      }
    };

    let html;
    if (mod.attrs.userLevel === 30) {
      html = reportTemplate(body);
    }

    if (mod.attrs.userLevel === 20) {
      html = siteModReportTemplate(body);
    }

    const emailOpts = {
      to: mod.auth.email,
      subject: `User report: ${roomName} - ${String(body._id)}`,
      html,
    };

    const args = [emailOpts, cb];
    queue.addToQueue(args);
  });

  return;
};

export async function resolveReport(reportId, user, outcome) {
  let report;
  try {
    report = await reportModel.findOne({ _id: reportId }).exec();
  } catch (err) {
    log.fatal({ err }, 'failed to get report');
    throw err;
  }

  if (!report) {
    const error = new Error();
    error.name = 'MissingValueError';
    error.message = 'Report not found';
    throw error;
  }

  report.resolution = {
    resolved: true,
    resolvedBy: user,
    resolvedAt: Date.now(),
    outcome,
  };

  let updatedReport;
  try {
    updatedReport = await report.save();
  } catch (err) {
    throw err;
  }

  try {
    const action = {
      type: adminConstants.activity.REPORT_RESOLUTION,
      id: String(updatedReport._id),
    };

    await adminUtils.addModActivity(user, action);
  } catch (err) {
    log.fatal({ err }, 'error adding acitivity entry');
    throw err;
  }

  return updatedReport;
};

export default { getReportById, incrementReport, getTimeLeft, sendReportMessages, resolveReport };
