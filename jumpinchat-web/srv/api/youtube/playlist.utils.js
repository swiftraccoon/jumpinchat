
import mongoose from 'mongoose';
import PlaylistModel from './playlist.model.js';
export function getMediaByRoomId(room) {
  return new Promise(async (resolve, reject) => {
    try {
      const playlist = await PlaylistModel
        .findOne({ room })
        .populate({
          path: 'media.startedBy',
          select: ['username', 'profile.pic'],
        })
        .exec();

      if (playlist) {
        return resolve(playlist);
      }

      const newPlaylist = await PlaylistModel.create({
        room,
      });
      return resolve(newPlaylist);
    } catch (err) {
      return reject(err);
    }
  });
};

export function removePlaylistByRoomId(room) {
  return PlaylistModel.deleteOne({ room }).exec();
};
