/**
 * Created by vivaldi on 25/10/2014.
 */


import express from 'express';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import helmet from 'helmet';
import errorHandler from 'errorhandler';
import { createClient as createRedisClient } from 'redis';
import { RedisStore } from 'connect-redis';
import path from 'path';
import ejs from 'ejs';
import config from './env/index.js';
import logFactory from '../utils/logger.util.js';
const log = logFactory({ name: 'express.config' });
export default function expressConfig(app, io) {
  const env = app.get('env');

  // Trust first proxy (nginx) so Express sees X-Forwarded-Proto as HTTPS
  // Required for secure session cookies behind reverse proxy
  app.set('trust proxy', 1);

  // Create a redis client for connect-redis session store
  const sessionRedisOpts = {};
  if (config.redis) {
    sessionRedisOpts.url = config.redis.uri;
  }
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
  app.use('/api/payment/stripe/event', express.raw({ type: '*/*' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
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
