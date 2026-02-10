
import _ from 'lodash';
const { omit } = _;
import logFactory from '../../../utils/logger.util.js';
import unignoreUserController from '../controllers/room.unignoreUser.js';
import utils from '../../../utils/utils.js';
const log = logFactory({ name: 'unignoreUser.socket' });
export default function unignoreUserSocket(socket) {
  return function unignoreUser({ id }) {
    unignoreUserController(id, socket.id, (err) => {
      if (err) {
        return socket.emit('client::error', {
          context: 'banner',
          ...err,
        });
      }

      const { session } = socket.handshake;
      const unignoredUser = session.ignoreList.find(i => i.id === id);

      if (!unignoredUser) {
        return socket.emit('client::error', utils.messageFactory({
          context: 'chat',
          message: 'user not found',
        }));
      }


      const ignoredMessage = utils.messageFactory({
        timestamp: new Date(),
        message: `You are no longer ignoring ${unignoredUser.handle}`,
      });

      socket.emit('room::status', ignoredMessage);

      session.ignoreList = session.ignoreList.filter(i => i.id !== id);
      log.debug({ ignoreList: session.ignoreList }, 'new ignore list');
      session.save();

      return socket.emit('room::updateIgnore', {
        ignoreList: session.ignoreList.map(i => omit(i, ['sessionId'])),
      });
    });
  };
};
