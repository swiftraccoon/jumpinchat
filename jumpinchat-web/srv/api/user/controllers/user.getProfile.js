
import logFactory from '../../../utils/logger.util.js';
import userUtils from '../user.utils.js';
import { getTrophies } from '../../trophy/trophy.utils.js';
const log = logFactory({ name: 'user.changeEmail' });
function getUserType(user) {
  const {
    userLevel,
    isSupporter,
  } = user.attrs;

  const userLevelMap = {
    0: 'registered user',
    20: 'site moderator',
    30: 'site administrator',
  };

  if (userLevel > 0) {
    return userLevelMap[userLevel];
  }

  if (isSupporter) {
    return 'site supporter';
  }

  return userLevelMap[0];
}

export default function getProfile(req, res) {
  const { userId } = req.params;

  return userUtils.getUserById(userId, async (err, user) => {
    if (err) {
      log.fatal({ err }, 'error getting user');
      return res.status(500).send({ error: 'ERR_SRV', message: 'Server error' });
    }

    if (!user) {
      log.warn('Could not find user');
      return res
        .status(404)
        .send({ error: 'ERR_NO_USER', message: 'Could not find user' });
    }

    const userTrophies = user.trophies
      .map(t => String(t.trophyId));
    try {
      const trophies = await getTrophies();
      const filteredTrophies = trophies.filter(t => userTrophies.includes(String(t._id)));

      const profile = {
        username: user.username,
        joinDate: user.attrs.join_date,
        lastActive: user.attrs.last_active,
        location: user.profile.location,
        pic: user.profile.pic,
        trophies: filteredTrophies.slice(0, 8),
        trophyCount: filteredTrophies.length,
        userType: getUserType(user),
      };

      return res.status(200).send(profile);
    } catch (error) {
      log.fatal({ error }, 'error fetching trophies');
      return res.status(500).send({ error: 'ERR_SRV', message: 'Server error' });
    }
  });
};
