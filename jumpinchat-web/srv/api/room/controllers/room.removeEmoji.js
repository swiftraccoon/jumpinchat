
import roomEmojiModel from '../roomEmoji.model.js';
import { getRoomById } from '../room.utils.js';
import logFactory from '../../../utils/logger.util.js';
import { remove } from '../../../lib/storage.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'removeEmoji' });
export default async function getEmoji(req, res) {
  const {
    emojiId,
  } = req.params;
  const { user } = req;
  const userId = String(user._id);

  try {
    const emoji = await roomEmojiModel
      .findOne({ _id: emojiId })
      .exec();

    if (!emoji) {
      return res.status(404).send(errors.ERR_NOT_FOUND);
    }

    const room = await getRoomById(emoji.room);

    log.debug({
      addedBy: emoji.addedBy,
      userId,
      owner: room.attrs.owner,
    });
    if (String(emoji.addedBy) !== userId && userId !== String(room.attrs.owner)) {
      return res.status(403).send(errors.ERR_NO_PERMISSION);
    }

    try {
      await remove(emoji.image);
    } catch (removeErr) {
      log.fatal({ err: removeErr }, 'failed to remove file');
      return res.status(500).send(errors.ERR_SRV);
    }

    log.info('removed file from storage');

    await roomEmojiModel.deleteOne({ _id: emojiId }).exec();
    return res.status(204).send();
  } catch (err) {
    log.fatal({ err }, 'failed to fetch room emoji');
    return res.status(500).send(errors.ERR_SRV);
  }
};
