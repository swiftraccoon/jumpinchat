

import logFactory from '../../utils/logger.util.js';
import playVideoSocket from './sockets/playVideo.socket.js';
import pauseVideoSocket from './sockets/pauseVideo.socket.js';
import resumeVideoSocket from './sockets/resumeVideo.socket.js';
import getCurrentlyPlayingSocket from './sockets/getCurrentlyPlaying.socket.js';
import removeVideoSocket from './sockets/removeVideo.socket.js';
import seekVideoSocket from './sockets/seekVideo.socket.js';
const log = logFactory({ name: 'playVideo.controller' });
export function register(socket, io) {
  const playVideo = playVideoSocket(socket, io);
  const pauseVideo = pauseVideoSocket(socket, io);
  const resumeVideo = resumeVideoSocket(socket, io);
  const getCurrentlyPlaying = getCurrentlyPlayingSocket(socket, io);
  const removeVideo = removeVideoSocket(socket, io);
  const seekVideo = seekVideoSocket(socket, io);

  socket.on('youtube::play', playVideo);
  socket.on('youtube::pause', pauseVideo);
  socket.on('youtube::resume', resumeVideo);
  socket.on('youtube::remove', removeVideo);
  socket.on('youtube::checkisplaying', getCurrentlyPlaying);
  socket.on('youtube::seek', seekVideo);
};

export default { register };
