
import logFactory from '../../../utils/logger.util.js';
import roomModel from '../room.model.js';
const log = logFactory({ name: 'getAvgUsersInRoom' });
export default function getAvgUsersInRoom(janusServer) {
  return new Promise(async (resolve, reject) => {
    let total = 0;
    let count = 0;

    try {
      const q = [
        {
          $match: {
            'attrs.janusServerId': janusServer,
            users: { $ne: [] },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $size: '$users',
              },
            },
            count: {
              $sum: 1,
            },
          },
        },
      ];

      const [result] = await roomModel
        .aggregate(q)
        .exec();

      if (result) {
        ({ total, count } = result);
      }
    } catch (err) {
      return reject(err);
    }

    if (total > 0 && count > 0) {
      return resolve({
        average: total / count,
        total,
      });
    }

    return resolve({
      average: 0,
      total: 0,
    });
  });
};
