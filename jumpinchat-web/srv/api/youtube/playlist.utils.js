
import mongoose from 'mongoose';
import PlaylistModel from './playlist.model.js';
export async function getMediaByRoomId(room) {
  try {
    const playlist = await PlaylistModel
      .findOne({ room })
      .populate({
        path: 'media.startedBy',
        select: ['username', 'profile.pic'],
      })
      .exec();

    if (playlist) {
      return playlist;
    }

    const newPlaylist = await PlaylistModel.create({
      room,
    });
    return newPlaylist;
  } catch (err) {
    throw err;
  }
};

export function removePlaylistByRoomId(room) {
  return PlaylistModel.deleteOne({ room }).exec();
};
