const { differenceInYears, getDate, getMonth, getYear } = require('date-fns');
const { toZonedTime } = require('date-fns-tz');
const log = require('../../utils/logger.util')({ name: 'trophy utils' });
const trophyModel = require('./trophy.model');
const { types } = require('./trophies');
const userUtils = require('../user/user.utils');
const metaSendMessage = require('../message/utils/metaSendMessage.util');
const {
  trophyAchieved,
} = require('../message/message.constants');


module.exports.getTrophyByName = function getTrophyByName(name, cb) {
  const promise = trophyModel.findOne({ name }).exec();
  if (!cb) return promise;
  promise.then((trophy) => {
    if (!trophy) {
      log.warn({ name }, 'trophy not found');
      return cb('ERR_NOT_FOUND');
    }
    return cb(null, trophy);
  }, (err) => {
    log.fatal({ err }, 'error fetching trophy');
    cb(err);
  });
};

module.exports.getTrophies = function getTrophies() {
  return trophyModel.find().exec();
};

function checkDateMatchesCondition(conditionDate) {
  const date = new Date();

  const dateMatches = getDate(date) === conditionDate.date;
  const monthMatches = (getMonth(date) + 1) === conditionDate.month;
  let yearMatches = true;
  if (conditionDate.year) {
    yearMatches = getYear(date) === conditionDate.year;
  }

  return dateMatches && monthMatches && yearMatches;
}

module.exports.checkDateMatchesCondition = checkDateMatchesCondition;

function checkMembershipDuration(userJoinDate, trophies) {
  const duration = differenceInYears(new Date(), new Date(userJoinDate));
  return trophies
    .filter(t => t.type === types.TYPE_MEMBER_DURATION)
    .filter(t => duration >= t.conditions.duration.years);
}

module.exports.checkMembershipDuration = checkMembershipDuration;

function checkOccasion(trophies) {
  const dateMax = toZonedTime(new Date(), 'Pacific/Kiritimati');
  const dateMin = toZonedTime(new Date(), 'Pacific/Niue');

  return trophies
    .filter(t => t.type === types.TYPE_OCCASION)
    .filter((t) => {
      const {
        date: {
          day,
          month,
          year,
        },
      } = t.conditions;

      const matchesMax = day === getDate(dateMax)
        && month === getMonth(dateMax) + 1
        && year === getYear(dateMax);

      const matchesMin = day === getDate(dateMin)
        && month === getMonth(dateMin) + 1
        && year === getYear(dateMin);

      return matchesMin || matchesMax;
    });
}

module.exports.checkOccasion = checkOccasion;

module.exports.findApplicableTrophies = function findApplicableTrophies(userId, cb) {
  let applicableTrophies = [];
  return userUtils.getUserById(userId, (err, user) => {
    if (err) {
      log.fatal({ err }, 'failed to get user');
      return cb(err);
    }

    if (!user) {
      return cb('ERR_NO_USER');
    }

    return trophyModel.find().exec()
      .then((trophies) => {
        applicableTrophies = [
          ...checkMembershipDuration(user.attrs.join_date, trophies),
          ...checkOccasion(trophies),
        ]
          .map(t => ({
            trophyId: t._id,
          }))
          .filter(t => !user.trophies
            .find(userTrophy => String(userTrophy.trophyId) === String(t.trophyId)))
          .forEach((t) => {
            user.trophies.push(t);
          });

        return user.save()
          .then(() => cb(null, applicableTrophies))
          .catch((saveErr) => {
            log.fatal({ err: saveErr }, 'error saving user');
            cb(saveErr);
          });
      })
      .catch((err) => {
        log.fatal({ err }, 'error getting trophies');
        cb('ERR_SRV');
      });
  });
};

module.exports.applyTrophy = async function applyTrophy(userId, trophyName, cb) {
  log.debug({ userId, trophyName }, 'applying trophy');
  try {
    const user = await userUtils.getUserById(userId, { lean: false });
    const trophy = await trophyModel.findOne({ name: trophyName }).exec();

    if (!user) {
      return cb('ERR_NO_USER');
    }

    if (!trophy) {
      log.error({ trophyName }, 'trophy not found');
      return cb('ERR_NOT_FOUND');
    }

    const trophyItem = { trophyId: trophy._id };
    const trophyExists = user.trophies
      .some(t => String(trophy._id) === t.trophyId);
    if (!trophyExists) {
      user.trophies.push(trophyItem);
      log.debug({ trophy }, 'apply trophy');

      try {
        await metaSendMessage(userId, trophyAchieved(trophy.title));
        log.debug('trophy message sent');
      } catch (messageErr) {
        log.error({ err: messageErr }, 'failed to send message');
      }
      return user.save()
        .then(() => cb())
        .catch(err => cb(err));
    }

    log.debug('user has trophy already, skipping');

    return cb();
  } catch (err) {
    log.fatal({ err });
    return cb(err);
  }
};

module.exports.dedupe = async function dedupe(userId) {
  const userTrophies = [];
  let user;

  try {
    user = await userUtils.getUserById(userId, { lean: false });
  } catch (err) {
    log.fatal({ err, userId }, 'failed fetching user');
    throw err;
  }

  const { trophies } = user;

  trophies.forEach((t) => {
    const trophyExists = userTrophies
      .some(({ trophyId }) => String(trophyId) === String(t.trophyId));
    if (!trophyExists) {
      userTrophies.push(t);
    }
  });

  user.trophies = userTrophies;

  try {
    await user.save();
  } catch (err) {
    log.fatal({ err }, 'failed to save user');
    throw err;
  }

  return userTrophies;
};

module.exports.removeTrophy = async function removeTrophy(userId, trophyName) {
  let user;
  let trophy;

  try {
    user = await userUtils.getUserById(userId, { lean: false });
  } catch (err) {
    throw err;
  }

  if (!user) {
    const error = new Error();
    error.name = 'MissingValueError';
    error.message = 'User not found';
    throw error;
  }

  try {
    trophy = await trophyModel.findOne({ name: trophyName }).exec();
  } catch (err) {
    throw err;
  }

  if (!trophy) {
    const error = new Error();
    error.name = 'MissingValueError';
    error.message = 'Trophy not found';
    throw error;
  }

  user.trophies = user.trophies.filter(t => String(t.trophyId) !== String(trophy._id));
  log.debug({ trophies: user.trophies }, 'updated user trophies');

  try {
    await user.save();
  } catch (err) {
    throw err;
  }

  return true;
};
