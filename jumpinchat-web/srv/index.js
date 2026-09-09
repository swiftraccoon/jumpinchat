import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import config from './config/env/index.js';
import { validateEnv } from './config/validateEnv.js';
import logFactory from './utils/logger.util.js';
import expressConfig from './config/express.config.js';
import mongooseConfig from './config/mongoose.config.js';
import mongoose from 'mongoose';
import redisUtil from './lib/redis.util.js';
import { registerHealthRoutes, waitUntilReady } from './lib/health.js';
import socketConfig from './config/socket.config.js';
import routes from './routes.js';
import { errorHandler } from './lib/asyncErrorHandler.js';

validateEnv(config.env, process.env);

export const app = express();
const server = http.createServer(app);
const sio = new SocketIOServer(server);
const log = logFactory({ name: 'server' });

let stopping = false;
const redisClient = redisUtil();
let sessionRedisClient;
let socketClients;
const isReady = () => !stopping
  && mongoose.connection.readyState === 1
  && redisClient.isReady && sessionRedisClient?.isReady
  && socketClients?.pubClient.status === 'ready'
  && socketClients?.subClient.status === 'ready';

// Health probes bypass sessions and application middleware.
registerHealthRoutes(app, {
  isReady,
  check: () => Promise.all([
    mongoose.connection.db.admin().command({ ping: 1 }),
    redisClient.ping(), sessionRedisClient.ping(),
    socketClients.pubClient.ping(), socketClients.subClient.ping(),
  ]),
});
app.use((req, res, next) => {
  if (!isReady()) return res.status(503).send('Service temporarily unavailable');
  return next();
});
sessionRedisClient = expressConfig(app, sio);
socketClients = socketConfig(sio);
routes(app);
app.use(errorHandler);

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  try {
    await new Promise(resolve => sio.close(resolve));
    await Promise.allSettled([
      mongoose.disconnect(),
      redisClient.isOpen ? redisClient.close() : undefined,
      sessionRedisClient.isOpen ? sessionRedisClient.close() : undefined,
      socketClients.pubClient.quit(), socketClients.subClient.quit(),
    ]);
  } finally {
    clearTimeout(deadline);
    process.exit(exitCode);
  }
}

process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

async function start() {
  await mongooseConfig();
  await waitUntilReady(isReady);
  if (stopping) return;
  server.on('error', (err) => {
    log.fatal({ err }, 'HTTP server error');
    shutdown(1);
  });
  server.listen(config.port, () => {
    log.info({ port: config.port, env: config.env, videoCodec: config.janus.room.codec },
      'server listening');
  });
}

start().catch((err) => {
  log.fatal({ err }, 'server startup failed');
  shutdown(1);
});
