
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import { getRoomIdFromName } from '../../room/room.utils.js';
import { getMediaByRoomId } from '../playlist.utils.js';
const log = logFactory({ name: 'getPlaylist.controller' });
export default async function getPlaylist(req, res) {
  const { roomName } = req.params;
  try {
    const roomId = await getRoomIdFromName(roomName);
    const playlist = await getMediaByRoomId(roomId);

    return res.status(200).send(playlist.media.toObject().map(m => ({
      ...m,
      startedBy: {
        userId: m.startedBy._id,
        username: m.startedBy.username,
        pic: m.startedBy.profile.pic,
      },
    })));
  } catch (err) {
    log.fatal({ err, roomName }, 'error fetching room');
    return res.status(500).send(errors.ERR_SRV);
  }
};
