
import logFactory from '../../utils/logger.util.js';
import BanlistModel from './siteban.model.js';
const log = logFactory({ name: 'sitebanUtils' });
export async function getBanlistItemBySession(sessionId) {
  try {
    const item = await BanlistModel.findOne({ sessionId }).exec();
    return item;
  } catch (err) {
    log.fatal({ err, sessionId }, 'error fetching banlist item');
    throw err;
  }
};

export function getBanlistItemById(id) {
  return BanlistModel.findOne({ _id: id }).exec();
};

export async function getBanlistItem({
  sessionId,
  ip,
  userId,
  // fingerprint,
  username,
  email,
}) {
  let queryParams = [
    { ip },
  ];

  if (userId) {
    queryParams = [
      ...queryParams,
      { userId },
    ];
  }

  if (sessionId) {
    queryParams = [
      ...queryParams,
      { sessionId },
    ];
  }

  // if (fingerprint) {
  //   queryParams = [
  //     ...queryParams,
  //     { fingerprint },
  //   ];
  // }

  if (username) {
    queryParams = [
      ...queryParams,
      { username },
    ];
  }

  if (email) {
    queryParams = [
      ...queryParams,
      { email },
    ];
  }

  return BanlistModel
    .findOne()
    .or(queryParams)
    .where('expiresAt').gt(new Date())
    .exec();
};

export default { getBanlistItemBySession, getBanlistItemById, getBanlistItem };
