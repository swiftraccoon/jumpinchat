/**
 * Created by Zaccary on 24/07/2016.
 */


import logFactory from '../../../utils/logger.util.js';
import roomUtils from '../../room/room.utils.js';
const log = logFactory({ name: 'getActiveRooms.controller' });
export default function getRoomById(req, res) {
  log.info({ roomId: req.params.roomId }, 'fetching room');
  roomUtils.getRoomById(req.params.roomId, (err, room) => {
    if (err) {
      log.fatal({ err }, 'failed to get room');
      res.status(500).send(err);
      return;
    }

    res.status(200).send(room);
  });
};
