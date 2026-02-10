
import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import janusUtil from '../../../lib/janus.util.js';
const log = logFactory({ name: 'getJanusToken' });
export default function getJanusToken(req, res) {
  return res.status(200).send({ token: janusUtil.getJanusToken() });
};
