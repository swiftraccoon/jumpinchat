import axios from 'axios';
import { trackEvent } from './AnalyticsUtil';
import SocketUtil from './SocketUtil';
import {
  setYoutubeSearchResults,
  setYoutubeVideo,
  setResultsLoading,
  setVideoPaused,
  setVideoResumed,
  setPlaylist,
  setVideoSeek,
} from '../actions/YoutubeActions';
import { addNotification } from '../actions/NotificationActions';

import {
  setModalError,
} from '../actions/ModalActions';
import { ALERT_COLORS } from '../constants/AlertMap';
import { getRoomName } from './RoomUtils';

const events = {
  YT_SET_PLAYING: 'youtube::play',
  YT_SET_PAUSE: 'youtube::pause',
  YT_SET_RESUME: 'youtube::resume',
  YT_REMOVE: 'youtube::remove',
  YT_PLAYING: 'youtube::playvideo',
  YT_PAUSED: 'youtube::videoPaused',
  YT_RESUMED: 'youtube::videoResume',
  YT_CHECK_PLAYING: 'youtube::checkisplaying',
  YT_PLAYLIST_UPDATE: 'youtube::playlistUpdate',
  YT_SEEK: 'youtube::seek',
};

export function getSearch(query) {
  trackEvent('Youtube', 'search video', `${query}`);
  setResultsLoading(true);
  setYoutubeSearchResults([]);
  setModalError(null);

  axios.get(`/api/youtube/search/${encodeURIComponent(query)}`)
    .then((response) => {
      setResultsLoading(false);
      return setYoutubeSearchResults(response.data);
    })
    .catch((err) => {
      setResultsLoading(false);

      if (err.response && err.response.data && err.response.data.message) {
        return setModalError({ message: err.response.data.message });
      }

      return setModalError({ message: 'error getting search results' });
    });
}

export function getPlaylist() {
  const roomName = getRoomName();
  axios.get(`/api/youtube/${roomName}/playlist`)
    .then((response) => {
      return setPlaylist(response.data);
    })
    .catch((err) => {
      if (err.response && err.response.data && err.response.data.message) {
        trackEvent('Error', 'Playlist', err.response.data.message);
        return addNotification({
          color: ALERT_COLORS.ERROR,
          message: err.response.data.message,
        });
      }

      trackEvent('Error', 'Playlist', err.message || 'Unknown');
      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: 'error getting video playlist',
      });
    });
}

export function setPlayYoutubeVideos(playVideos) {
  trackEvent('Youtube', 'Set play videos', playVideos ? 'true' : 'false');
  axios.put(`/api/youtube/playvideos?play=${playVideos}`)
    .catch((err) => {
      if (err.response && err.response.data && err.response.data.error && err.response.data.error.text) {
        setModalError({ message: err.response.data.error.text });
        addNotification({
          color: 'red',
          message: err.response.data.error.text,
          autoClose: false,
        });
      } else {
        addNotification({
          color: 'red',
          message: 'Error changing settings',
          autoClose: false,
        });
      }
    });
}

export function checkVideoPlaying(notify = true) {
  SocketUtil.emit(events.YT_CHECK_PLAYING, { notify });
}

export function syncYoutubeMessages() {
  SocketUtil.listen(events.YT_PLAYING, (msg) => {
    setYoutubeVideo(msg);
    getPlaylist();
  });

  SocketUtil.listen(events.YT_PAUSED, (msg) => {
    setVideoPaused(msg);
  });

  SocketUtil.listen(events.YT_RESUMED, (msg) => {
    setVideoResumed(msg);
  });

  SocketUtil.listen(events.YT_SEEK, (msg) => {
    setVideoSeek(msg);
  });


  SocketUtil.listen(events.YT_PLAYLIST_UPDATE, (msg) => {
    setPlaylist(msg);
    checkVideoPlaying(false);
  });

  checkVideoPlaying();
  getPlaylist();
}

export function setYoutubeVideoPlaying(videoId, title) {
  trackEvent('Youtube', 'play video', videoId);
  SocketUtil.emit(events.YT_SET_PLAYING, { videoId, title });
}

export function pauseVideo() {
  trackEvent('Youtube', 'pause video');
  SocketUtil.emit(events.YT_SET_PAUSE);
}

export function resumeVideo() {
  trackEvent('Youtube', 'resume video');
  SocketUtil.emit(events.YT_SET_RESUME);
}

export function removeVideo(id) {
  trackEvent('Youtube', 'remove video from playlist');
  SocketUtil.emit(events.YT_REMOVE, { id });
}

export function seekVideo(seekTo) {
  trackEvent('Youtube', 'remove video from playlist');
  SocketUtil.emit(events.YT_SEEK, { seekTo });
}
