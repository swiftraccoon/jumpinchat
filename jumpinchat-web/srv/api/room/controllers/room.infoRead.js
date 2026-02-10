
import logFactory from '../../../utils/logger.util.js';
import Joi from 'joi';
import roomUtils from '../room.utils.js';
const log = logFactory({ name: 'room.infoRead' });
export default function infoRead(req, res) {
  const schema = Joi.object().keys({
    room: Joi.string().required(),
  });

  const { error, value: validated } = schema.validate(req.params);
  if (error) {
    log.warn({ err: error }, 'invalid room name');
    return res.status(400)
      .send({ error: 'ERR_VALIDATION', message: 'Invalid room ID' });
  }

  log.debug({ token: validated.token }, 'verifying reset token');
  return roomUtils.getRoomById(validated.room, (err, room) => {
    if (err) {
      log.fatal({ err }, 'error getting room');
      return res.status(500).send({ error: 'ERR_SRV' });
    }

    if (!room) {
      log.warn({ roomName: room.name }, 'room not found');
      return res.status(404).send({ error: 'ERR_NO_ROOM' });
    }

    room.attrs.fresh = false;
    return room.save()
      .then(() => res.status(200).send())
      .catch((saveErr) => {
        log.fatal({ err: saveErr }, 'error saving room');
        res.status(500).send({ error: 'ERR_SRV' });
      });
  });
};
