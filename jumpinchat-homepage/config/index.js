/**
 * Created by Zaccary on 20/03/2017.
 */

import _ from 'lodash';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env.NODE_ENV || 'development';

const all = {
  env,
  port: process.env.PORT || 3000,

  // Root path of server
  root: path.normalize(`${__dirname}/../..`),

  chatcolors: [
    '#cc0000',
    '#3466a5',
    '#5c3466',
    '#8e3901',
    '#ce5d00',
    '#4e9a06',
    '#59a19d',
    '#10a879',
  ],

  cookies: {
    account: 'jic.ident',
  },
  cache: {
    duration: 60 * 1,
    exclude: [
      '/logout',
    ],
  },

  admin: {
    userList: {
      itemsPerPage: 30,
    },
  },
};

const envModule = await import(`./env/${env}.js`);
export default _.merge(all, envModule.default);
