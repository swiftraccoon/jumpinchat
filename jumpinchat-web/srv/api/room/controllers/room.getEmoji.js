
import { isBefore } from 'date-fns';
import roomEmojiModel from '../roomEmoji.model.js';
import { getRoomByName } from '../room.utils.js';
import { getUserById } from '../../user/user.utils.js';
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'getEmoji' });
export default async function getEmoji(req, res) {
  const { roomName } = req.params;

  try {
    const room = await getRoomByName(roomName);

    if (!room) {
      log.error({ roomName }, 'room does not exists');
      return res.status(404).send();
    }

    if (!room.attrs.owner) {
      return res.status(200).send([]);
    }

    const owner = await getUserById(room.attrs.owner, { lean: true });

    if (!owner) {
      return res.status(404).send();
    }


    const supportExpired = isBefore(new Date(owner.attrs.supportExpires), new Date());
    if (!owner.attrs.isGold && supportExpired) {
      return res.status(200).send([]);
    }


    const emoji = await roomEmojiModel
      .find({ room: room._id })
      .populate({
        path: 'addedBy',
        select: [
          'username',
          'profile.pic',
        ],
      })
      .exec();

    return res.status(200).send(emoji);
  } catch (err) {
    log.fatal({ err }, 'failed to fetch room emoji');
    return res.status(500).send(errors.ERR_SRV);
  }
};
