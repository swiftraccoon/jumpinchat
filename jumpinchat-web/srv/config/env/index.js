/**
 * Created by vivaldi on 25/10/2014.
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import _ from 'lodash';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const all = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3232,
  deployLocation: process.env.DEPLOY_LOCATION,

  // Root path of server
  root: path.normalize(`${__dirname}/../../..`),

  chatcolors: [
    'red',
    'green',
    'yellow',
    'blue',
    'purple',
    'aqua',
    'orange',
    'redalt',
    'greenalt',
    'yellowalt',
    'bluealt',
    'purplealt',
    'aquaalt',
    'orangealt',
  ],

  uploads: {
    userProfileAvatar: {
      width: 256,
      height: 256,
      size: 1024 * 512,
    },
    roomCover: {
      width: 640,
      height: 480,
      size: 1024 * 512,
    },
    userIcon: {
      width: 48,
      height: 48,
      size: 1024 * 128,
    },
  },
  roomRegExp: '[a-zA-Z0-9-]+',
  reservedUsernames: [
    'register',
    'login',
    'help',
    'settings',
    'admin',
    'directory',
    'api',
    'terms',
    'privacy',
    'contact',
    'users',
    'group',
    'groups',
    'rooms',
    'room',
    'support',
    'messages',
    'profile',
    'ageverify',
    'closed',
    'sitemod',
  ],

  admin: {
    userList: {
      itemsPerPage: 30,
    },
  },
};

// Dynamic import to load only the matching environment config
// (production.js accesses env vars that don't exist in dev/test)
const envModule = await import(`./${all.env}.js`);

export default _.merge(all, envModule.default || {});
