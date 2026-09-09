import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import { checkUserSession, initLocals, initErrorHandlers, cache } from './routes/middleware.js';
import routes from './routes/index.js';
import { registerHealthRoutes } from './utils/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
let stopping = false;
let server;
let sessionReady = false;
registerHealthRoutes(app, {
  isReady: () => !stopping && sessionReady && mongoose.connection.readyState === 1,
  check: () => mongoose.connection.db.admin().command({ ping: 1 }),
});

// Trust first proxy (nginx) so Express sees X-Forwarded-Proto as HTTPS
// Required for secure session cookies behind reverse proxy
app.set('trust proxy', 1);

// Security headers — disable CSP for now (will configure later)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));

// View engine
app.set('views', path.join(__dirname, 'templates', 'views'));
app.set('view engine', 'pug');

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 1000 * 60 * 60 * 24, // 1 day
}));

// Body parsing
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Cookie parser
app.use(cookieParser(config.auth.cookieSecret));

// MongoDB connection URI from environment (same as keystone.js used)
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost/tc';
const connection = mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 60000 });

// Share the ODM client and await the session collection/index before listening.
const sessionStore = MongoStore.create({
  clientPromise: connection.then(() => mongoose.connection.getClient()),
  ttl: Math.floor(config.auth.cookieTimeout / 1000),
});
app.use(session({
  secret: config.auth.cookieSecret,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: config.env === 'production',
    sameSite: 'lax',
    maxAge: config.auth.cookieTimeout,
    httpOnly: true,
  },
}));

// Template locals (replaces keystone.set('locals', ...))
app.use((req, res, next) => {
  res.locals.env = config.env;
  res.locals.location = process.env.DEPLOY_LOCATION;
  next();
});

// Middleware (applied before all routes)
app.use(cache);
app.use(checkUserSession);
app.use(initLocals);
app.use(initErrorHandlers);

// Routes
routes(app);

// 404 handler
app.use((req, res) => {
  res.status(404).render('errors/404', {
    errorTitle: undefined,
    errorMsg: undefined,
    user: req.user,
  });
});

// Error handler
app.use((err, req, res, next) => {
  let message;
  if (err instanceof Error) {
    message = err.message;
  }
  res.status(500).render('errors/500', {
    err,
    errorTitle: undefined,
    errorMsg: message,
  });
});

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  try {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  } finally {
    clearTimeout(deadline);
    process.exit(exitCode);
  }
}
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

Promise.all([connection, sessionStore.collectionP]).then(() => {
  if (stopping) return;
  sessionReady = true;
  server = app.listen(config.port, () => {
    console.log(`Homepage server listening on port ${config.port} [${config.env}]`);
  });
  server.on('error', (err) => {
    console.error('HTTP server failed:', err);
    shutdown(1);
  });
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  shutdown(1);
});

export default app;
