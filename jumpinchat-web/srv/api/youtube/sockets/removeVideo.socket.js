
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import { getMediaByRoomId } from '../playlist.utils.js';
import roomUtils from '../../room/room.utils.js';
import { playVideo } from '../controllers/playVideo.controller.js';
const log = logFactory({ name: 'removeVideo.socket' });
export default function removeVideoSocket(socket, io) {
  return function removeVideo({ id }) {
    roomUtils.getSocketCacheInfo(socket.id, async (err, data) => {
      if (err) {
        log.fatal({ err }, 'Error getting socket cache info');
        return socket.emit(
          'client::error',
          utils.messageFactory({
            timestamp: new Date(),
            context: 'chat',
            message: 'Error removing Youtube video',
          }),
        );
      }

      if (!data) {
        log.error('Socket data missing');
        return socket.emit(
          'client::error',
          utils.messageFactory({
            timestamp: new Date(),
            context: 'chat',
            message: 'Error removing Youtube video',
          }),
        );
      }

      const roomName = data.name;

      playVideo.removeFromPlaylist(id, roomName, async (err, removedItem) => {
        if (err) {
          log.fatal({ err }, 'Error getting socket cache info');
          return socket.emit(
            'client::error',
            utils.messageFactory({
              timestamp: new Date(),
              context: 'chat',
              message: 'Error removing Youtube video',
            }),
          );
        }

        if (!removedItem) {
          log.warn('Can not remove non-existing media');
          return socket.emit(
            'client::error',
            utils.messageFactory({
              timestamp: new Date(),
              context: 'chat',
              message: 'Media no longer exists in playlist',
            }),
          );
        }

        const roomId = await roomUtils.getRoomIdFromName(roomName);
        const { media } = await getMediaByRoomId(roomId);

        io.to(roomName).emit(
          'youtube::playlistUpdate',
          media,
        );

        io.to(roomName).emit(
          'room::status',
          utils.messageFactory({
            message: `${data.handle} removed a video from the playlist: ${removedItem.title}`,
          }),
        );
      });
    });
  };
};
