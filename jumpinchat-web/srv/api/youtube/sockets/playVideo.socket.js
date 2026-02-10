
import logFactory from '../../../utils/logger.util.js';
import utils from '../../../utils/utils.js';
import { PermissionError } from '../../../utils/error.util.js';
import roomUtils from '../../room/room.utils.js';
import { getUserHasRolePermissions } from '../../role/role.utils.js';
import { playVideo } from '../controllers/playVideo.controller.js';
const log = logFactory({ name: 'playVideo.socket' });
export default function playYoutubeVideoSocket(socket, io) {
  return async function playYoutubeVideo(msg) {
    const roomName = [...socket.rooms].find(k => k !== socket.id);

    let data;

    try {
      data = await roomUtils.getSocketCacheInfo(socket.id);
    } catch (err) {
      log.error({ err }, 'Error getting socket cache info');
      return socket.emit('client::error', {
        timestamp: new Date(),
        context: 'chat',
        message: 'Error starting Youtube video',
      });
    }

    let room;

    try {
      room = await roomUtils.getRoomByName(roomName);
    } catch (err) {
      log.fatal({ roomName, err }, 'failed to find room');
      return socket.emit(
        'client::error',
        {
          timestamp: new Date(),
          context: 'chat',
          message: 'Error starting Youtube video',
        },
      );
    }

    if (!room) {
      log.error({ roomName }, 'failed to find room');
      return socket.emit(
        'client::error',
        {
          timestamp: new Date(),
          context: 'chat',
          message: 'Error starting Youtube video',
        },
      );
    }

    try {
      await getUserHasRolePermissions(room.name, { userId: data.userId }, 'playMedia');
    } catch (err) {
      log.fatal({ err }, 'failed to check role permissions');
      if (err instanceof PermissionError) {
        return socket.emit('client::error', {
          timestamp: new Date(),
          context: 'chat',
          message: 'You don\'t have permission to play videos',
        });
      }

      return socket.emit('client::error', {
        timestamp: new Date(),
        context: 'chat',
        message: 'Error starting Youtube video',
      });
    }


    return playVideo.addToPlaylist(msg.videoId, roomName, data.userId, (err, mediaList, videoDetails) => {
      if (err) {
        return socket.emit('client::error', {
          timestamp: new Date(),
          context: 'chat',
          message: 'Error starting Youtube video',
        });
      }

      playVideo.getMedia(data.name, videoDetails._id, (err, media) => {
        if (err) {
          return socket.emit('client::error', {
            timestamp: new Date(),
            context: 'chat',
            message: 'Error starting Youtube video',
          });
        }

        io.to(roomName).emit(
          'youtube::playlistUpdate',
          mediaList,
        );

        io.to(roomName).emit(
          'room::status',
          utils.messageFactory({
            message: `${data.handle} added a video to the playlist: ${msg.title} (https://youtu.be/${msg.videoId})`,
          }),
        );
      });
    });
  };
};
