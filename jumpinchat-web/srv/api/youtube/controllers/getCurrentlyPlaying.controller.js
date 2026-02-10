
import { isBefore } from 'date-fns';
import logFactory from '../../../utils/logger.util.js';
import roomUtils from '../../room/room.utils.js';
import { playVideo } from './playVideo.controller.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'getCurrentlyPlaying.controller' });
export default function getCurrentlyPlaying(socket, cb) {
  return roomUtils.getSocketCacheInfo(socket.id, async (err, socketInfo) => {
    if (err) {
      log.fatal({ err }, 'failed to get socket cache info');
      return cb(err);
    }

    if (!socketInfo) {
      log.error({ socketId: socket.id }, 'no socket cache info');
      return cb('ERR_NO_SOCKET');
    }

    const { name: roomName } = socketInfo;


    // check if first media item is still within time range
    // if true, return that item
    // if false, remove item from playlist by filtering expired items (endtime < current time)
    // then, return the new current item with applied start time

    try {
      const current = new Date();

      return playVideo.getCurrentMedia(roomName, (err, currentlyPlaying) => {
        if (err) {
          return cb(err);
        }

        if (!currentlyPlaying) {
          return cb();
        }

        const currentHasCompleted = isBefore(new Date(currentlyPlaying.endTime), current);
        const currentHasStarted = !!currentlyPlaying.startTime;

        if (!currentHasStarted) {
          return playVideo.startMedia(currentlyPlaying._id, roomName, cb);
        }

        if (!currentHasCompleted || currentlyPlaying.pausedAt) {
          return cb(null, currentlyPlaying);
        }

        // currently playing has ended, remove it from the playlist
        // check for any current media. If there are more playlist
        // items start playing them
        playVideo.removeFromPlaylist(currentlyPlaying._id, roomName, (err) => {
          if (err) {
            log.error({ mediaId: currentlyPlaying._id }, 'failed to remove video from playlist');
            return;
          }

          return playVideo.getCurrentMedia(roomName, (err, nextMedia) => {
            if (err) {
              log.error({ err }, 'error getting currently playing media');
              return cb(err);
            }

            if (!nextMedia) {
              return cb();
            }

            return playVideo.startMedia(nextMedia._id, roomName, (err, newCurrentlyPlaying) => {
              if (err) {
                log.error({ err }, 'error starting next media');
                return cb(err);
              }

              if (!newCurrentlyPlaying) {
                return cb();
              }

              return cb(null, newCurrentlyPlaying);
            });
          });
        });
      });
    } catch (err) {
      log.fatal({ err, roomName }, 'error fetching room');
      return cb(errors.ERR_SRV);
    }
  });
};
