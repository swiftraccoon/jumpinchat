/**
 * Created by vivaldi on 09/11/2014.
 */



import jwt from 'jsonwebtoken';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import logFactory from '../utils/logger.util.js';
import config from './env/index.js';
import utils from '../utils/utils.js';
import trophyUtils from '../api/trophy/trophy.utils.js';
import roomSocket from '../api/room/room.socket.js';
import userSocket from '../api/user/user.socket.js';
import youtubeSocket from '../api/youtube/youtube.socket.js';
import roomController from '../api/room/room.controller.js';
import adminController from '../api/admin/admin.controller.js';
import roleUtils from '../api/role/role.utils.js';
const log = logFactory({ name: 'socket.config' });
function _onConnect(socket, io) {
  roomSocket.register(socket, io);
  userSocket.register(socket, io);
  youtubeSocket.register(socket, io);
}

export default function socketConfig(io) {
  // JWT authentication middleware (replaces socketio-jwt)
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication error: no token'));
    }

    try {
      jwt.verify(token, config.auth.jwt_secret);
      // Store token on handshake for backward compat with handlers
      // that read socket.handshake.auth.token
      next();
    } catch (err) {
      return next(new Error('Authentication error: invalid token'));
    }
  });

  // Redis adapter (replaces socket.io-redis with @socket.io/redis-adapter + ioredis)
  const pubClient = new Redis(config.redis.uri);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  adminController.setSocketIo(io);
  roomController.setSocketIo(io);
  roleUtils.setSocketIo(io);

  io.on('connection', (socket) => {
    log.info({ socketId: socket.id }, 'Connected to socket');

    // Replaces socketio-wildcard's socket.on('*', ...)
    socket.onAny(() => {
      utils.updateLastSeen(socket.id, async (err, updated, userId) => {
        if (err) {
          log.error({ err }, 'failed to update last seen');
          return false;
        }

        if (updated) {
          log.debug('user last seen updated');

          try {
            await trophyUtils.dedupe(userId);
            log.info({ userId }, 'deduped trophies');
          } catch (err) {
            log.fatal({ err }, 'failed deduping trophies');
          }

          return trophyUtils.findApplicableTrophies(userId, async (err) => {
            if (err) {
              log.fatal({ err }, 'failed to find applicable trophies');
              return false;
            }

            log.debug('saved user trophies');
          });
        }

        log.debug('user last seen not updated');
      });
    });

    socket.on('disconnect', () => {
      log.debug({ socketId: socket.id }, 'socket disconnected');
    });

    socket.on('error', (err) => {
      log.error({ err }, 'socket error');
    });

    socket.connectedAt = new Date();

    _onConnect(socket, io);
  });
};
