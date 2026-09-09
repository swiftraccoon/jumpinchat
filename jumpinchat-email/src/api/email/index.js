const express = require('express');
const send = require('./send');

function createRouter(options) {
  const router = express.Router();
  router.post('/send', send.createSendController(options));
  return router;
}

module.exports = createRouter();
module.exports.createRouter = createRouter;
