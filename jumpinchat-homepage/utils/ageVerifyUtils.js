import createLogger from './logger.js';
import request from './request.js';
import { api } from '../constants/constants.js';

const log = createLogger({ name: 'utils.ageVerifyUtils' });

export async function getRequests(token, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/ageverify`,
      headers: {
        Authorization: token,
      },
    });
    return cb(null, body);
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        return cb(body.message);
      }
      log.error({ statusCode: err.response.status }, 'error getting report');
      return cb('error');
    }
    log.fatal({ err }, 'error happened');
    return cb(err);
  }
}

export async function getRequestById(token, id, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/ageverify/${id}`,
      headers: {
        Authorization: token,
      },
    });
    return cb(null, body);
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        return cb(body.message);
      }
      log.error({ statusCode: err.response.status }, 'error getting report');
      return cb('error');
    }
    log.fatal({ err }, 'error happened');
    return cb(err);
  }
}

export async function updateRequest(token, requestId, status, reason = null) {
  const body = {};

  if (reason) {
    body.reason = reason;
  }

  try {
    await request({
      method: 'PUT',
      url: `${api}/api/ageverify/${requestId}?status=${status}`,
      headers: {
        Authorization: token,
      },
      body,
    });
    return 'request updated';
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error updating request');
      throw 'error happened';
    }
    log.fatal({ err }, 'error sending request');
    throw 'Error happened';
  }
}
