/**
 * Created by vivaldi on 08/11/2014.
 */


import mongoose from 'mongoose';
import config from './env/index.js';
import logFactory from '../utils/logger.util.js';
const log = logFactory({ name: 'mongoose.config' });
if (config.env === 'development') {
  mongoose.set('debug', (coll, method, query, doc, options) => {
    const set = {
      coll,
      method,
      query,
      doc,
      options,
    };

    // log.info({ dbQuery: set });
  });
}

export default function mongooseConfig() {
  mongoose.connect(config.mongo.uri, config.mongo.options)
    .catch((err) => {
      log.fatal({ err }, 'failed to connect to MongoDB');
      throw err;
    });

  mongoose.connection.on('connected', () => {
    log.info('Mongoose connected');
  });

  mongoose.connection.on('error', (err) => {
    log.fatal({ err }, 'mongoose error');
  });

  mongoose.connection.on('disconnected', () => {
    log.fatal('Mongoose disconnected');
  });
};
