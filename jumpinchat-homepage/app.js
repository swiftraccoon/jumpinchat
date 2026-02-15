import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

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

// Session with MongoStore
app.use(session({
  secret: config.auth.cookieSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoUri,
    ttl: Math.floor(config.auth.cookieTimeout / 1000),
  }),
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

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Route loading will be added in task A5

// Connect to MongoDB and start server
mongoose.connect(mongoUri)
  .then(() => {
    console.log('Mongoose connected to', mongoUri);
    app.listen(config.port, () => {
      console.log(`Homepage server listening on port ${config.port} [${config.env}]`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

export default app;
