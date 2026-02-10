
import redisFactory from '../../../lib/redis.util.js';
import logFactory from '../../../utils/logger.util.js';
const redis = redisFactory();
const log = logFactory({ name: 'room.registerPush' });
export default function registerPush(req, res) {
  const { socketId } = req.params;
  const {
    endpoint,
    ttl,
    key,
    authSecret,
  } = req.body;

  const pushData = {
    pushEndpoint: endpoint,
    pushTTL: ttl,
    pushKey: key,
    pushAuth: authSecret,
  };

  redis.hSet(socketId, pushData).then(() => {
    res.status(204).send();
  }).catch((err) => {
    log.fatal({ err }, 'Failed to set push data');
    res.status(500).send('ERR_SRV');
  });
};
