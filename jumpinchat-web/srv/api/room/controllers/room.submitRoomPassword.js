
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import config from '../../../config/env/index.js';
import logFactory from '../../../utils/logger.util.js';
import roomUtils from '../room.utils.js';
const log = logFactory({ name: 'room.submitRoomPassword' });
export default async function submitRoomPassword(req, res) {
  const schema = Joi.object().keys({
    password: Joi.string().required(),
  });

  try {
    const { error, value: { password } } = schema.validate(req.body);
    if (error) throw error;
    return roomUtils.getRoomByName(req.params.room, async (err, room) => {
      if (err) {
        log.fatal({ err }, 'error getting room');
        return res.status(500).send({ error: 'ERR_SRV' });
      }

      if (!room) {
        log.warn({ roomName: room.name }, 'room not found');
        return res.status(404).send({ error: 'ERR_NO_ROOM' });
      }

      try {
        const match = await bcrypt.compare(password, room.settings.passhash);
        if (!match) {
          return res.status(401).send({
            error: 'ERR_PASSWORD',
            message: 'Password incorrect',
          });
        }

        const token = jwt.sign({ room: room.name }, config.auth.jwt_secret);

        res.cookie(`jic.password.${room.name}`, token, {
          maxAge: 1000 * 60 * 5,
          httpOnly: true,
          secure: config.auth.secureSessionCookie,
          sameSite: 'lax',
        });

        return res.status(200).send();
      } catch (pwErr) {
        log.error({ err: pwErr }, 'error comparing room password');
        return res.status(500).send('ERR_SRV');
      }
    });
  } catch (err) {
    log.warn({ err }, 'invalid room name');
    return res.status(400)
      .send({ error: 'ERR_VALIDATION', message: 'Invalid room ID' });
  }
};
