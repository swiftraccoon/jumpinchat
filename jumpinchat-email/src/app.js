const express = require('express');
const routes = require('./routes');

module.exports = function createApp(options = {}) {
  const app = express();
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));
  routes(app, options);
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    return res.status(err.status || 500).send('Unable to process request');
  });
  return app;
};
