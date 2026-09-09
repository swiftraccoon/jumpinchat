const http = require('http');
const config = require('./config/env');
const log = require('./utils/logger')({ name: 'server' });
const createApp = require('./app');

if (config.env === 'production' && !process.env.SHARED_SECRET) {
  throw new Error('SHARED_SECRET is required');
}
const server = http.createServer(createApp());
server.on('error', (err) => {
  log.fatal({ err }, 'email server failed');
  process.exitCode = 1;
});
server.listen(config.port, () => {
  log.info({ port: config.port, env: config.env }, 'server listening');
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  server.close(() => {
    clearTimeout(deadline);
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
