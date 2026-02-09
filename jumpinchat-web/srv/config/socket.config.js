/**
 * Created by vivaldi on 09/11/2014.
 */

const jwt = require('jsonwebtoken');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const log = require('../utils/logger.util')({ name: 'socket.config' });
const config = require('./env');
const utils = require('../utils/utils');

const trophyUtils = require('../api/trophy/trophy.utils');
const roomSocket = require('../api/room/room.socket');
const userSocket = require('../api/user/user.socket');
const youtubeSocket = require('../api/youtube/youtube.socket');
const roomController = require('../api/room/room.controller');
const adminController = require('../api/admin/admin.controller');
const roleUtils = require('../api/role/role.utils');

function _onConnect(socket, io) {
  roomSocket.register(socket, io);
  userSocket.register(socket, io);
  youtubeSocket.register(socket, io);
}

module.exports = function socketConfig(io) {
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
