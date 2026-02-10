
import { startOfHour, startOfDay } from 'date-fns';
import _ from 'lodash';
const { groupBy } = _;
import config from '../../config/env/index.js';
import logFactory from '../../utils/logger.util.js';
import redisFactory from '../../lib/redis.util.js';
import StatsModel from './stats.model.js';
import SiteModModel from './sitemod.model.js';
import ModActivityModel from './modActivity.model.js';
const log = logFactory({ name: 'adminUtils' });
const redis = redisFactory();
const statsKey = 'stats';

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getStubData(length) {
  const data = [];
  for (let i = length; i >= 0; i -= 1) {
    data.push({
      x: new Date(Date.now() - (1000 * 60 * 15 * i)).toISOString(),
      y: getRandomIntInclusive(0, 50),
    });
  }

  return data;
}

function getStubStats() {
  const data = [];
  const length = 2688;

  for (let i = length; i >= 0; i -= 1) {
    data.push({
      createdAt: new Date(Date.now() - (1000 * 60 * 15 * i)).toISOString(),
      rooms: [{
        name: 'foo',
        users: getRandomIntInclusive(0, 15),
        broadcasters: getRandomIntInclusive(0, 10),
      }],
    });
  }

  return data;
}

export function formatData(data) {
  const userData = data.map(s => ({
    x: s.createdAt,
    y: s.rooms.reduce((acc, r) => acc += r.users, 0),
  }));

  const broadcasterData = data.map(s => ({
    x: s.createdAt,
    y: s.rooms.reduce((acc, r) => acc += r.broadcasters, 0),
  }));

  return [userData, broadcasterData];
};

function mergeData(data, unit) {
  const groupedResults = groupBy(data, ({ x }) => unit === 'hour' ? startOfHour(new Date(x)) : startOfDay(new Date(x)));

  return Object.entries(groupedResults)
    .map(([label, groupedData]) => {
      const sum = groupedData.reduce((acc, { y }) => acc += y, 0);
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
  return data
    .map(d => d.slice(limit * -1));
}

export function getStats() {
  const diff = 1000 * 60 * 60 * 24 * 7 * 4;
  const limit = new Date(Date.now() - diff);

  if (config.env === 'development') {
    return getStubStats();
  }

  return StatsModel
    .find({
      createdAt: {
        $gte: limit,
      },
    })
    .exec();
};

export function getStatsDay(stats) {
  const limit = 96;

  const limitedStats = getLimitedData(stats, limit);
  return limitedStats.map(v => mergeData(v, 'hour'));
};

export function getStatsWeek(stats) {
  const limit = 672;

  const limitedStats = getLimitedData(stats, limit);
  return limitedStats.map(v => mergeData(v, 'day'));
};

export function getStatsMonth(stats) {
  const limit = 2688;

  const limitedStats = getLimitedData(stats, limit);
  return limitedStats.map(v => mergeData(v, 'day'));
};

export async function setStatsInCache(stats) {
  let statsString;
  try {
    statsString = JSON.stringify(stats);
  } catch (err) {
    log.fatal({ err }, 'failed to stringify stats');
    throw err;
  }

  try {
    await redis.set(statsKey, statsString);
    await redis.expire(statsKey, config.admin.stats.ttl);
  } catch (err) {
    log.fatal({ err }, 'failed to set stats');
    throw err;
  }
};

export async function getStatsFromCache() {
  let ttl;
  try {
    ttl = await redis.ttl(statsKey);
  } catch (err) {
    log.fatal({ err }, 'failed to get stats');
    throw err;
  }

  if (ttl === -2) {
    log.debug('stats have expired, skipping');
    return undefined;
  }

  let stats;
  try {
    stats = await redis.get(statsKey);
  } catch (err) {
    log.fatal({ err }, 'failed to get stats');
    throw err;
  }

  try {
    return JSON.parse(stats);
  } catch (err) {
    log.fatal({ err }, 'failed to parse stats');
    throw err;
  }
};

export function addSiteMod(sitemod) {
  return SiteModModel.create(sitemod);
};

export function removeSiteMod(id) {
  return SiteModModel.deleteOne({ _id: id });
};

export function getSiteModById(modId) {
  return SiteModModel
    .findOne({ _id: modId })
    .exec();
};

export function getSiteMods() {
  return SiteModModel
    .find({})
    .populate({
      path: 'user',
      select: ['username', 'profile.pic'],
    })
    .populate({
      path: 'addedBy',
      select: ['username', 'profile.pic'],
    })
    .exec();
};

export function addModActivity(user, action) {
  const activityItem = {
    user,
    action,
  };

  return ModActivityModel.create(activityItem);
};

export function getModActivityCount() {
  return ModActivityModel.countDocuments({}).exec();
};

export function getModActivity(start, end) {
  return ModActivityModel
    .find({})
    .skip(start)
    .limit(end)
    .sort({ createdAt: -1 })
    .populate({
      path: 'user',
      select: ['username', 'profile.pic'],
    })
    .exec();
};

export default { formatData, getStats, getStatsDay, getStatsWeek, getStatsMonth, setStatsInCache, getStatsFromCache, addSiteMod, removeSiteMod, getSiteModById, getSiteMods, addModActivity, getModActivityCount, getModActivity };
