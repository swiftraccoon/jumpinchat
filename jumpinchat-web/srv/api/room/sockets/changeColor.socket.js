
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import changeChatColor from '../controllers/room.changeChatColor.js';
const log = logFactory({ name: 'changeColor.socket' });
export default function changeColorSocket(socket, io) {
  return function changeHandle(msg) {
    changeChatColor(socket.id, msg.color, (err, result) => {
      if (err) {
        if (err.message) {
          log.error({ err }, 'changeColor error');
          socket.emit('client::error',
            {
              context: 'banner',
              message: err.message,
              error: err.error,
            });

          return;
        }

        throw err;
      }

      socket.emit('room::status',
        utils.messageFactory({
          message: 'Chat color changed',
          color: result.color,
        }));

      socket.emit('self::user', { user: { color: result.color } });

      io.to(result.room).emit('room::updateUser', { user: result.user, color: result.color });
    });
  };
};
