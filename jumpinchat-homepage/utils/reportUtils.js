import createLogger from './logger.js';
import request from './request.js';
import { api } from '../constants/constants.js';

const log = createLogger({ name: 'utils.reportUtils' });

export async function getReports(token, page, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/report?page=${page}`,
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

export async function getReportById(token, id, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/report/${id}`,
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

export async function getMessageReports(token, page, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/report/message?page=${page}`,
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
      log.error({ statusCode: err.response.status }, 'error getting reports');
      return cb('error');
    }
    log.fatal({ err }, 'error happened');
    return cb(err);
  }
}

export async function getMessageReportById(token, id, cb) {
  try {
    const body = await request({
      method: 'GET',
      url: `${api}/api/report/message/${id}`,
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

export async function setReportResolved(token, reportId) {
  try {
    return await request({
      method: 'POST',
      url: `${api}/api/report/resolve`,
      headers: {
        Authorization: token,
      },
      body: {
        reportId,
      },
    });
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        throw body.message;
      }
      log.error({ statusCode: err.response.status }, 'error updating report');
      throw new Error(`${err.response.status} error updating report`);
    }
    log.fatal({ err }, 'error happened');
    throw err;
  }
}
