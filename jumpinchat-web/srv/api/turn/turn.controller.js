
import crypto from 'crypto';
import config from '../../config/env/index.js';
import logFactory from '../../utils/logger.util.js';
const log = logFactory({ name: 'api.turn' });
const generateTurnCredentials = function generateTurnCredentials(name) {
  const { ttl } = config.turn;
  const timestamp = Math.floor(Date.now() / 1000) + Number(ttl);
  const username = [timestamp, name || timestamp].join(':');

  const hash = crypto.createHmac('sha1', config.auth.turnSecret);
  hash.setEncoding('base64');
  hash.write(username);
  hash.end();
  const password = hash.read();
  return {
    password,
    username,
  };
};

export function getTurnCreds(req, res) {
  const uris = config.turn.uris.flatMap(uri => /^turns?:/.test(uri) ? [uri] : [
    `turn:${uri}:3478?transport=udp`,
    `turn:${uri}:3478?transport=tcp`,
  ]);

  if (!uris.length) return res.status(200).send({ uris: [], ttl: 0 });
  if (!config.auth.turnSecret) return res.status(503).send({ error: 'TURN is not configured' });

  log.debug({ uris }, 'getTurnCreds');

  const { ttl } = config.turn;
  const creds = generateTurnCredentials(req.query.username);

  const responseObj = {
    username: creds.username,
    password: creds.password,
    uris,
    ttl,
  };

  res.status(200).send(responseObj);
};

export default { getTurnCreds };
