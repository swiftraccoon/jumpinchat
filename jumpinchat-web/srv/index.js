import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import config from './config/env/index.js';
import { validateEnv } from './config/validateEnv.js';
import logFactory from './utils/logger.util.js';
import expressConfig from './config/express.config.js';
import mongooseConfig from './config/mongoose.config.js';
import './lib/redis.util.js';
import socketConfig from './config/socket.config.js';
import routes from './routes.js';
import { errorHandler } from './lib/asyncErrorHandler.js';

validateEnv(config.env, process.env);

export const app = express();
const server = http.createServer(app);
const sio = new SocketIOServer(server);
const log = logFactory({ name: 'server' });

expressConfig(app, sio);
mongooseConfig();
socketConfig(sio);
routes(app);
app.use(errorHandler);

server.listen(config.port, (err) => {
  if (err) {
    throw err;
  }

  log.info({
    port: config.port,
    env: config.env,
    videoCodec: config.janus.room.codec,
  }, 'server listening');
});
