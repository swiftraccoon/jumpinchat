
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import currentlyPlaying from '../controllers/getCurrentlyPlaying.controller.js';
const log = logFactory({ name: 'getCurrentlyPlaying.socket' });
export default function getCurrentlyPlayingSocket(socket) {
  return function getCurrentlyPlaying({ notify = true }) {
    return currentlyPlaying(socket, (err, videoData) => {
      if (err) {
        log.fatal({ err }, 'error starting video');
        return socket.emit(
          'client::error',
          {
            timestamp: new Date(),
            context: 'chat',
            message: 'Error starting Youtube video',
          },
        );
      }

      if (videoData) {
        log.debug({ videoData }, 'currently playing');
        socket.emit('youtube::playvideo', videoData);

        if (notify) {
          return socket.emit(
            'room::status',
            utils.messageFactory({
              message: `Currently playing: ${videoData.title} (${videoData.link})`,
            }),
          );
        }
      }
    });
  };
};
