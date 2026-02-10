/**
 * Created by vivaldi on 25/10/2014.
 */

const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const helmet = require('helmet');
const errorHandler = require('errorhandler');
const { createClient: createRedisClient } = require('redis');
const RedisStore = require('connect-redis')(session);
const path = require('path');
const ejs = require('ejs');
const config = require('./env');
const log = require('../utils/logger.util')({ name: 'express.config' });

module.exports = function expressConfig(app, io) {
  const env = app.get('env');

  // Trust first proxy (nginx) so Express sees X-Forwarded-Proto as HTTPS
  // Required for secure session cookies behind reverse proxy
  app.set('trust proxy', 1);

  // Create a separate legacy-mode redis client for connect-redis v6
  // (connect-redis v6 uses callback-based API, not redis v4 promises)
  const sessionRedisOpts = {};
  if (config.redis) {
    sessionRedisOpts.url = config.redis.uri;
  }
  sessionRedisOpts.legacyMode = true;
  const sessionRedisClient = createRedisClient(sessionRedisOpts);
  sessionRedisClient.connect().catch((err) => {
    log.fatal({ err }, 'session redis connection failed');
  });

  const cookieParserInstance = cookieParser(config.auth.cookieSecret);
  const sessionInstance = session({
    store: new RedisStore({
      client: sessionRedisClient,
    }),
    resave: false,
    saveUninitialized: true,
    secret: config.auth.cookieSecret,
    cookie: {
      secure: config.auth.secureSessionCookie,
      sameSite: 'lax',
    },
  });
  app.use(sessionInstance);
  app.use(cookieParserInstance);

  // Share Express session with Socket.io (replaces express-socket.io-session)
  io.use((socket, next) => {
    const req = socket.request;
    const res = { getHeader() {}, setHeader() {} };
    cookieParserInstance(req, res, (err) => {
      if (err) return next(err);
      socket.handshake.signedCookies = req.signedCookies;
      sessionInstance(req, res, (err) => {
        if (err) return next(err);
        socket.handshake.session = req.session;
        socket.handshake.sessionStore = req.sessionStore;
        next();
      });
    });
  });

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  }));

  // CSP in report-only mode — logs violations without blocking
  app.use(helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://www.google-analytics.com',
        'https://cdn.headwayapp.co',
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://use.fontawesome.com',
        'https://maxcdn.bootstrapcdn.com',
        'https://unpkg.com',
      ],
      fontSrc: [
        "'self'",
        'https://fonts.gstatic.com',
        'https://use.fontawesome.com',
      ],
      imgSrc: [
        "'self'",
        'data:',
        'https://s3.amazonaws.com',
        'https://unpkg.com',
        'https://www.google-analytics.com',
      ],
      connectSrc: [
        "'self'",
        'wss:',
        'https:',
        'https://sentry.io',
        'https://www.google-analytics.com',
      ],
      mediaSrc: ["'self'", 'blob:'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      frameSrc: ["'self'", 'https://headway-widget.net'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    reportOnly: true,
  }));

  app.set('views', `${config.root}/srv/views`);
  app.set('view engine', 'pug');
  app.engine('ejs', ejs.renderFile);
  app.use((req, res, next) => {
    if (req.headers['x-amz-sns-message-type']) {
      req.headers['content-type'] = 'application/json;charset=UTF-8';
    }
    next();
  });
  app.use('/api/payment/stripe/event', bodyParser.raw({ type: '*/*' }));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(methodOverride());

  app.use(express.static(path.join(config.root, config.appPath)));
  app.set('appPath', config.root + config.appPath);

  if (env === 'development') {
    log.debug({ staticPath: path.join(config.root, '.tmp') });
    app.use(express.static(path.join(config.root, '.tmp')));
    app.use(express.static(path.join(config.root, 'node_modules')));
    app.use(errorHandler());
  }
};
