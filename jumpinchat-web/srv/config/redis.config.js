/**
 * Created by vivaldi on 23/11/2014.
 */


import redis from 'redis';
import config from './env/index.js';
export default function() {
  redis.createClient = redis.createClient();
};
