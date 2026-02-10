/**
 * Created by Zaccary on 24/07/2016.
 */


import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import roomUtils from '../../room/room.utils.js';
const log = logFactory({ name: 'getActiveRooms.controller' });
export default async function getActiveRooms(req, res) {
  log.info('attempting to get room list');
  const { page } = req.query;
  const countPerPage = config.admin.userList.itemsPerPage;
  const start = ((page - 1) * countPerPage);

  const count = await roomUtils.getActiveRoomCount();

  roomUtils.getActiveRooms(start, countPerPage, false, (err, rooms) => {
    if (err) {
      log.fatal({ err }, 'failed to get room list');
      return res.status(500).send(err);
    }

    return res.status(200).send({
      count,
      rooms,
    });
  });
};
