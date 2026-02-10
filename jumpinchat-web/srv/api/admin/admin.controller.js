
import logFactory from '../../utils/logger.util.js';
import Joi from 'joi';
import _notifyServerRestart from './controllers/notifyServerRestart.controller.js';
import _notify from './controllers/notify.controller.js';
import getActiveRooms from './controllers/getActiveRooms.controller.js';
import getRoomById from './controllers/getRoomById.controller.js';
import getUserList from './controllers/getUserList.controller.js';
const log = logFactory({ name: 'admin.controller' });
let _io;

export function setSocketIo(io) {
  log.debug({ io: !!io }, 'setSocketIo');
  _io = io;
};

export function getSocketIo() {
  return _io;
};

export function notifyServerRestart(req, res) {
  _notifyServerRestart(req.params.seconds, _io, (err) => {
    if (err) {
      log.fatal({ err }, 'failed to start restart notification');
      res.status(500).send(err);
      return;
    }

    res.status(200).send();
  });
};

export function notify(req, res) {
  const schema = Joi.object().keys({
    message: Joi.string().required(),
    type: Joi.string().valid(
      'INFO',
      'SUCCESS',
      'ALERT',
      'WARNING',
    ).required(),
    room: Joi.string(),
  });

  const { error: validateErr, value: validated } = schema.validate(req.body);
  if (validateErr) {
    log.warn({ body: req.body, validateErr }, 'invalid body');
    return res.status(400).send(validateErr);
  }

  if (!_io) {
    log.fatal('socketIO not connected');
    return res.status(500).send();
  }

  _notify(_io, validated, (notifyErr) => {
    if (notifyErr) {
      log.error({ notifyErr });
      return res.status(500).send('Broke it');
    }

    return res.status(200).send();
  });
};

export { getActiveRooms };
export { getRoomById };
export { getUserList };

export default { setSocketIo, getSocketIo, notifyServerRestart, notify, getActiveRooms, getRoomById, getUserList };
