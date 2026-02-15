import jwt from 'jsonwebtoken';
import logFactory from '../../utils/logger.js';
import config from '../../config/index.js';
import {
  getRequestById,
  updateRequest,
} from '../../utils/ageVerifyUtils.js';
import {
  ageVerifyRejectReasons,
} from '../../constants/constants.js';

const log = logFactory({ name: 'routes.adminRoomDetails' });

const statuses = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
};

export default async function adminAgeVerificationDetails(req, res) {
  const { locals } = res;

  const { requestId } = req.params;
  locals.section = `Admin | Age verification ${requestId}`;
  locals.user = req.user;
  locals.request = {};
  locals.rejectReasons = ageVerifyRejectReasons;

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });

  await new Promise((resolve) => {
    getRequestById(token, requestId, (err, request) => {
      if (err) {
        log.fatal({ err }, 'error getting request');
        return resolve('error');
      }

      if (!request) {
        log.error('Request not found');
        return resolve('notfound');
      }

      locals.request = request;
      return resolve();
    });
  }).then((result) => {
    if (result === 'error') return res.status(500).send({ error: 'error getting request' });
    if (result === 'notfound') return res.status(404).send({ error: 'request not found' });
    return null;
  });

  // POST: approve
  if (req.method === 'POST' && req.body.action === 'approve') {
    try {
      locals.success = await updateRequest(token, requestId, statuses.APPROVED);
    } catch (err) {
      log.error({ err }, 'error updating request');
      locals.error = err;
    }

    return res.render('adminAgeVerificationDetails');
  }

  // POST: reject
  if (req.method === 'POST' && req.body.action === 'reject') {
    const { rejectReason } = req.body;

    try {
      locals.success = await updateRequest(token, requestId, statuses.REJECTED, rejectReason);
    } catch (err) {
      log.error({ err }, 'error updating request');
      locals.error = err;
    }

    return res.render('adminAgeVerificationDetails');
  }

  // POST: deny
  if (req.method === 'POST' && req.body.action === 'deny') {
    try {
      locals.success = await updateRequest(token, requestId, statuses.DENIED);
    } catch (err) {
      log.error({ err }, 'error updating request');
      locals.error = err;
    }

    return res.render('adminAgeVerificationDetails');
  }

  return res.render('adminAgeVerificationDetails');
}
