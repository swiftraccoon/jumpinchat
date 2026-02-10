
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import roomUtils from '../../room/room.utils.js';
import { playVideo } from '../controllers/playVideo.controller.js';
import { PermissionError } from '../../../utils/error.util.js';
const log = logFactory({ name: 'pauseVideo.socket' });
export default function pauseYoutubeVideoSocket(socket, io) {
  return function pauseYoutubeVideo(msg) {
    log.debug({ msg }, 'pause video socket');
    return utils.getSocketRooms(io, socket.id, (err, room) => {
      if (err) {
        return socket.emit(
          'client::error',
          {
            timestamp: new Date(),
            context: 'chat',
            message: 'Error pausing Youtube video',
          },
        );
      }

      return roomUtils.getSocketCacheInfo(socket.id, (err, data) => {
        if (err) {
          log.error({ err }, 'Error getting socket cache info');
          return socket.emit(
            'client::error',
            {
              timestamp: new Date(),
              context: 'chat',
              message: 'Error pausing Youtube video',
            },
          );
        }

        if (!data) {
          log.error({ socket: socket.id }, 'no session');
          return socket.emit('client::error', {
            timestamp: new Date(),
            context: 'chat',
            message: 'No session found, please refresh',
          });
        }

        return playVideo.pause(room, socket.id, (err, videoDetails) => {
          if (err) {
            if (err instanceof PermissionError) {
              return socket.emit('client::error', {
                timestamp: new Date(),
                context: 'chat',
                message: err.message,
              });
            }

            return socket.emit(
              'client::error',
              {
                timestamp: new Date(),
                context: 'chat',
                message: 'Error pausing Youtube video',
              },
            );
          }

          io.to(room).emit(
            'youtube::videoPaused',
            videoDetails,
          );

          return io.to(room).emit(
            'room::status',
            utils.messageFactory({
              message: `${data.handle} paused the video`,
            }),
          );
        });
      });
    });
  };
};
