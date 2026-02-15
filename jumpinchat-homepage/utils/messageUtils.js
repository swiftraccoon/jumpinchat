import jwt from 'jsonwebtoken';
import createLogger from './logger.js';
import request from './request.js';
import { errors, api } from '../constants/constants.js';
import config from '../config/index.js';

const log = createLogger({ name: 'messageUtils' });

export async function getConversation(userId, recipientId, token, page, cache = 1) {
  try {
    return await request({
      url: `${api}/api/message/${userId}/${recipientId}?page=${page}&cache=${cache}`,
      method: 'get',
      headers: {
        Authorization: token,
      },
    });
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        log.error({ message: body.message });
        const error = new Error('RequestError');
        error.message = body.message;
        throw error;
      }
      log.error({ statusCode: err.response.status }, 'failed to get conversation');
      const error = new Error('ServerError');
      error.message = errors.ERR_SRV;
      throw error;
    }
    log.error({ err }, 'error retrieving conversations');
    throw err;
  }
}

export async function getUnreadMessages(userId) {
  const token = jwt.sign(String(userId), config.auth.jwtSecret);
  try {
    return await request({
      url: `${api}/api/message/${userId}/unread`,
      method: 'get',
      headers: {
        Authorization: token,
      },
    });
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        log.error({ message: body.message });
        const error = new Error('RequestError');
        error.message = body.message;
        throw error;
      }
      log.error({ statusCode: err.response.status }, 'failed to get conversation');
      const error = new Error('ServerError');
      error.message = errors.ERR_SRV;
      throw error;
    }
    log.error({ err }, 'error retrieving unread conversations');
    throw err;
  }
}

export async function markMessagesRead(userId, participantId, token) {
  try {
    return await request({
      url: `${api}/api/message/read/${userId}/${participantId}`,
      method: 'put',
      headers: {
        Authorization: token,
      },
    });
  } catch (err) {
    if (err.response) {
      const body = err.response.data;
      if (body && body.message) {
        log.error({ message: body.message });
        const error = new Error('RequestError');
        error.message = body.message;
        throw error;
      }
      log.error({ statusCode: err.response.status }, 'error setting messages read');
      const error = new Error('ServerError');
      error.message = errors.ERR_SRV;
      throw error;
    }
    log.error({ err }, 'error setting messages read');
    throw err;
  }
}
