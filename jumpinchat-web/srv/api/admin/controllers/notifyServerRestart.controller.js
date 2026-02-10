/**
 * return a formatted string for a difference in time
 *
 * @param {Date} currentTime
 * @param {String} seconds
 * @returns {String}
 */
import logFactory from '../../../utils/logger.util.js';
import { formatDistanceToNow } from 'date-fns';
const log = logFactory({ name: 'notifyServerRestart.controller' });
function getFormattedTimeDiff(currentTime, seconds) {
  const restartTime = currentTime.getTime() + (parseInt(seconds, 10) * 1000);
  return formatDistanceToNow(new Date(restartTime), { addSuffix: true });
}

export default function notifyServerRestart(seconds, io, cb) {
  let messageInterval;
  const startTime = new Date();

  const emitRestartMessage = () => {
    const restartInMs = (parseInt(seconds, 10) * 1000);
    const restartTime = getFormattedTimeDiff(startTime, seconds);
    const timeDiff = new Date(startTime.getTime() + restartInMs).getTime();

    if (timeDiff < new Date().getTime()) {
      clearInterval(messageInterval);
    }

    io.emit('client::error',
      {
        timestamp: new Date(),
        context: 'chat',
        message: `Server will restart in ${restartTime}`,
      });
  };

  emitRestartMessage();

  messageInterval = setInterval(emitRestartMessage, 1000 * 60);

  cb(null);
};
