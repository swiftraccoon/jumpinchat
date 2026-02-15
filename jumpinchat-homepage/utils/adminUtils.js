import { startOfHour, startOfDay, isAfter } from 'date-fns';
import { groupBy } from 'lodash';
import createLogger from './logger.js';
import request from './request.js';
import { api } from '../constants/constants.js';
import Stats from '../models/Stats.js';

const log = createLogger({ name: 'routes.admin' });

function formatData(data) {
  const userData = data.map(s => ({
    x: s.createdAt,
    y: s.rooms.reduce((acc, r) => acc + r.users, 0),
  }));

  const broadcasterData = data.map(s => ({
    x: s.createdAt,
    y: s.rooms.reduce((acc, r) => acc + r.broadcasters, 0),
  }));

  return [userData, broadcasterData];
}

function mergeData(data, unit) {
  const startOfUnit = unit === 'hour' ? startOfHour : startOfDay;
  const groupedResults = groupBy(data, ({ x }) => startOfUnit(new Date(x)).toISOString());

  return Object.entries(groupedResults)
    .map(([label, groupedData]) => {
      const sum = groupedData.reduce((acc, { y }) => acc + y, 0);
      const avg = (sum > 0 && data.length > 0)
        ? sum / groupedData.length
        : 0;

      return {
        x: new Date(label).toISOString(),
        y: Math.round(avg),
      };
    });
}

function getLimitedData(data, limit) {
  const limitDate = new Date(limit);
  return data.filter(d => isAfter(new Date(d.createdAt), limitDate));
}

export function getStats() {
  const diff = 1000 * 60 * 60 * 24 * 7 * 4;
  const limit = new Date(Date.now() - diff);
  return Stats
    .find({
      createdAt: {
        $gte: limit,
      },
    })
    .exec();
}

export function getStatsDay(stats) {
  const diff = 1000 * 60 * 60 * 24;
  const limit = new Date(Date.now() - diff).toISOString();

  const limitedStats = getLimitedData(stats, limit);

  return formatData(limitedStats).map(v => mergeData(v, 'hour'));
}

export function getStatsWeek(stats) {
  const diff = 1000 * 60 * 60 * 24 * 7;
  const limit = new Date(Date.now() - diff).toISOString();

  const limitedStats = getLimitedData(stats, limit);
  return formatData(limitedStats).map(v => mergeData(v, 'day'));
}

export function getStatsMonth(stats) {
  const diff = 1000 * 60 * 60 * 24 * 7 * 4;
  const limit = new Date(Date.now() - diff).toISOString();

  const limitedStats = getLimitedData(stats, limit);
  return formatData(limitedStats).map(v => mergeData(v, 'day'));
}

export async function getBanItem(token, id) {
  try {
    return await request({
      method: 'GET',
      url: `${api}/api/admin/siteban/${id}`,
      headers: {
        Authorization: token,
      },
    });
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error fetching site ban');
      throw new Error('server error');
    }
    log.fatal({ err }, 'error sending request');
    throw err;
  }
}

export async function getSiteMods(token) {
  try {
    return await request({
      method: 'GET',
      url: `${api}/api/admin/sitemods`,
      headers: {
        Authorization: token,
      },
    });
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error fetching site mods');
      throw new Error('server error');
    }
    log.fatal({ err }, 'error sending request');
    throw err;
  }
}

export async function addSiteMod(token, username) {
  try {
    return await request({
      method: 'POST',
      url: `${api}/api/admin/sitemod`,
      headers: {
        Authorization: token,
      },
      body: {
        username,
      },
    });
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error fetching site mods');
      throw new Error('server error');
    }
    log.fatal({ err }, 'error sending request');
    throw err;
  }
}

export async function removeSiteMod(token, modId) {
  try {
    return await request({
      method: 'DELETE',
      url: `${api}/api/admin/sitemod/${modId}`,
      headers: {
        Authorization: token,
      },
    });
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error removing site mod');
      throw new Error('Server error');
    }
    log.fatal({ err }, 'error sending request');
    throw err;
  }
}

export async function getModActivity(token, page) {
  try {
    return await request({
      method: 'GET',
      url: `${api}/api/admin/modactivity?page=${page}`,
      headers: {
        Authorization: token,
      },
    });
  } catch (err) {
    if (err.response) {
      const responseBody = err.response.data;
      if (responseBody && responseBody.message) {
        throw responseBody.message;
      }
      log.error({ statusCode: err.response.status }, 'error fetching mod activity');
      throw new Error('server error');
    }
    log.fatal({ err }, 'error sending request');
    throw err;
  }
}
