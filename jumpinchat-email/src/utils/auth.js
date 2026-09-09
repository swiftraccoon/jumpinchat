const config = require('../config/env');
const log = require('./logger')({ name: 'utils.auth' });

function createAuth(sharedSecret = config.auth.sharedSecret) {
  return function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      log.error('missing auth header');
      return res.status(401).send();
    }

    if (!sharedSecret || authHeader !== sharedSecret) {
      log.warn('Invalid email service authentication');
      return res.status(401).send();
    }

    return next();
  };
}

module.exports = createAuth();
module.exports.createAuth = createAuth;
