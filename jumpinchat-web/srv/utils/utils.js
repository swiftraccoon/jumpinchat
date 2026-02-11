
import jwt from 'jsonwebtoken';
import { Jimp, HorizontalAlign, VerticalAlign } from 'jimp';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as uuid from 'uuid';
import requestIp from 'request-ip';
import logFactory from './logger.util.js';
import config from '../config/env/index.js';
import errors from '../config/constants/errors.js';
import userUtils from '../api/user/user.utils.js';
import roomUtils from '../api/room/room.utils.js';
import redisUtils from './redis.util.js';
import rateLimit from './rateLimit.js';
const log = logFactory({ name: 'utils' });
const { accessKey, secret, bucket } = config.aws.s3.jicUploads;

const s3Client = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secret,
  },
  region: 'us-east-1',
});

export function validateSession(req, res, next) {
  const token = req.cookies['jic.activity'];

  if (!token) {
    log.warn('no session token');
    return res.status(401).send();
  }

  return jwt.verify(token, config.auth.jwt_secret, (err, decoded) => {
    if (err) {
      log.fatal({ err }, 'error verifying activity token');
      return res.status(403).send();
    }

    if (!decoded) {
      log.error('session token could not be decoded');
      return res.status(401).send();
    }

    return next();
  });
};

export async function validateAccount(req, res, next) {
  let token;

  const identCookie = req.signedCookies['jic.ident'];

  if (identCookie) {
    token = identCookie;
  } else if (req.headers.authorization) {
    try {
      token = await jwt.verify(req.headers.authorization, config.auth.jwt_secret);
    } catch (err) {
      log.error({ err }, 'invalid authorization token');
      return res.status(401).send({ error: 'Unable to authenticate user' });
    }
  }

  if (!token) {
    log.warn('Identification token missing');
    return res.status(401).send({ error: 'Identification token missing' });
  }

  return userUtils.getUserById(token, { lean: true }, (err, user) => {
    if (err) {
      log.error({ err }, 'could not get user');
      return res.status(401).send({ error: 'Unable to authenticate user' });
    }

    if (!user) {
      log.error('user not found');
      return res.status(401).send({ error: 'Invalid user' });
    }

    req.user = user;

    return next();
  });
};

export function verifyInternalSecret(req, res, next) {
  const auth = req.headers.authorization;
  if (auth !== config.auth.sharedSecret) {
    log.error({ auth }, 'Invalid user attempted internal call');
    return res.status(401).send(errors.ERR_AUTH);
  }

  return next();
};

export function messageFactory(msg) {
  const commonMessageOpts = {
    timestamp: new Date(),
    id: uuid.v4(),
  };

  return { ...msg, ...commonMessageOpts };
};

export { rateLimit };

/**
 * Update the lastSeen prop on the user document. Primarily
 * for showing when a user has last been active. This function is
 * triggered when a user initiates any socket event via the `*` wildcard.
 *
 * When first called, a key will be set with the format `lastSeen:<userId>`
 * and an expire time of 5 minutes is set. Each subsequent call will check the
 * TTL of the key and only procede if it has expired (TTL of `-2`). The reason for
 * this is to prevent excessive calls to the DB during busy sessions.
 */
export function updateLastSeen(socketId, cb = () => {}) {
  return roomUtils.getSocketCacheInfo(socketId, async (err, socketData) => {
    if (err) {
      log.fatal({ err }, 'error getting socket data');
      return cb(err);
    }

    if (!socketData) {
      log.warn({ socketId }, 'No socket data');
      return cb('ERR_NO_CACHE');
    }

    if (socketData.userId) {
      const lastSeenKey = `lastSeen:${socketData.userId}`;

      let ttl;
      try {
        ttl = await redisUtils.callPromise('ttl', lastSeenKey);
      } catch (err) {
        log.fatal({ err }, 'failed to get ttl');
        return cb(err);
      }

      if (ttl > -2) {
        log.debug({ lastSeenKey, ttl }, 'key hasnt expired, skipping');
        return cb();
      }

      let user;

      try {
        user = await userUtils.getUserById(socketData.userId, { lean: false });
      } catch (err) {
        log.fatal({ err }, 'error getting socket data');
        return cb(err);
      }

      if (!user) {
        log.error({ userId: socketData.userId }, 'user not found');
        return cb('ERR_NO_USER');
      }

      try {
        await Object.assign(user, {
          attrs: Object.assign(user.attrs, {
            last_active: new Date(),
          }),
        }).save();
      } catch (err) {
        log.fatal({ err }, 'error saving user');
        return cb(err);
      }

      log.debug('last seen date set');

      try {
        await redisUtils.callPromise('set', lastSeenKey, Date.now());
      } catch (err) {
        log.fatal({ err }, 'error setting last seen cache');
        return cb(err);
      }

      log.debug({ lastSeenKey }, 'new lastSeen key set');

      try {
        await redisUtils.callPromise('expire', lastSeenKey, config.redis.lastSeenExpire);
      } catch (err) {
        log.fatal({ err }, 'error setting last seen cache expire');
        return cb(err);
      }

      return cb(null, true, socketData.userId);
    }

    return cb();
  });
};

/**
 * Resize and normalize image quality and file type.
 *
 * @param {Buffer} fileBuffer
 * @param {Object} dimensions
 * @param {number} dimensions.width
 * @param {number} dimensions.height
 * @param {function} cb
 */
export async function convertImages(fileBuffer, dimensions, cb) {
  log.debug('converting images');

  try {
    const image = await Jimp.read(fileBuffer);
    const mime = image.mime;

    if (mime === 'image/gif') {
      return cb(null, fileBuffer);
    }

    image.contain({
      w: dimensions.width,
      h: dimensions.height,
      align: HorizontalAlign.CENTER | VerticalAlign.MIDDLE,
    });

    const convertedBuffer = await image.getBuffer(mime, { quality: 60 });
    return cb(null, convertedBuffer);
  } catch (err) {
    log.fatal({ err }, 'error converting image');
    return cb(err);
  }
};

export function mergeBuffers(dataArr) {
  const dataLength = dataArr.map(d => d.length).reduce((a, b) => a + b);
  return Buffer.concat(dataArr.map(d => d.data), dataLength);
};

export function s3Upload(body, filePath, cb) {
  const params = {
    Bucket: bucket,
    Key: filePath,
    ACL: 'public-read',
    Body: body,
    CacheControl: 'public, max-age=86400',
  };

  s3Client.send(new PutObjectCommand(params))
    .then(data => cb(null, data))
    .catch(err => cb(err));
};

export function isValidImage(mimeType) {
  const isPng = mimeType === 'image/png';
  const isJpeg = mimeType === 'image/jpeg';
  const isGif = mimeType === 'image/gif';

  return isPng || isJpeg || isGif;
};

export function getExtFromMime(mimeType) {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
};

export function getRemoteIpFromReq(req) {
  const ip = requestIp.getClientIp(req);
  return ip;
};

export function createNotification(type, level, message, opts = {}) {
  const notification = {
    type,
    level,
    message,
  };

  if (opts.action) {
    notification.action = opts.action;
  }

  if (opts.timeout) {
    notification.timeout = opts.timeout;
  }

  if (opts.id) {
    notification.id = opts.id;
  }

  return notification;
};

export function getCookie(name, cookieString) {
  const value = `; ${cookieString}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
};

function verifyUserLevel(userId, authorization, level = 30) {
  return new Promise(async (resolve, reject) => {
    if (!userId) {
      log.debug('no cookie, attempting auth header');
      try {
        ({ userId } = await jwt.verify(authorization, config.auth.jwt_secret));
      } catch (err) {
        log.error({ err }, 'error verifying token');
        return reject(err);
      }
    }

    log.debug({ userId }, 'user id');

    if (userId) {
      try {
        const user = await userUtils.getUserById(userId, { lean: false });
        if (!user) {
          log.error('user not found');
          const error = new Error();
          error.name = 'NoUserError';
          error.message = 'User not found';
        }

        if (user.attrs.userLevel < level) {
          log.warn({
            level,
            userLevel: user.attrs.level,
          }, 'user not permitted to perform admin action');
          const error = new Error();
          error.name = 'PermissionDeniedError';
          error.message = 'User not permitted to perform admin action';
          return reject(error);
        }

        return resolve(user);
      } catch (err) {
        log.fatal({ err }, 'failed to get user');
        return reject(err);
      }
    } else {
      log.error('invalid token');
      const error = new Error();
      error.name = 'InvalidTokenError';
      error.message = 'Token is invalid';
      return reject(error);
    }
  });
}

export async function verifyAdmin(req, res, next) {
  const userId = req.signedCookies['jic.ident'];
  const { authorization } = req.headers;
  try {
    const user = await verifyUserLevel(userId, authorization, 30);
    req.user = user;
    return next();
  } catch (err) {
    log.error({ err, path: req.path }, 'auth error');
    return res.status(401).send(err.message);
  }
};

export async function verifySiteMod(req, res, next) {
  const userId = req.signedCookies['jic.ident'];
  const { authorization } = req.headers;
  try {
    const user = await verifyUserLevel(userId, authorization, 20);
    req.user = user;
    return next();
  } catch (err) {
    log.error({ err, path: req.path }, 'auth error');
    return res.status(401).send(err.message);
  }
};

export function getSocketRooms(io, socketId, cb) {
  io.in(socketId).fetchSockets().then((sockets) => {
    if (!sockets.length) {
      log.debug({ socketId }, 'socket not found');
      return cb(null, undefined);
    }

    const rooms = [...sockets[0].rooms].filter(r => r !== socketId);
    log.debug({ rooms, socketId }, 'socket rooms');
    cb(null, rooms[0]);
  }).catch((err) => {
    log.fatal({ err }, 'error getting client rooms');
    cb(err);
  });
};

export async function uploadDataUriToS3(filePath, uri, cb) {
  if (!uri) {
    log.debug('no URI to upload');
    return cb();
  }

  const buf = Buffer.from(uri.replace(/^data:image\/\w+;base64,/, ''), 'base64');

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: config.report.bucket,
      Key: filePath,
      Body: buf,
      ContentType: 'image/jpeg',
      ContentEncoding: 'base64',
      ACL: 'public-read',
    }));

    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: config.report.bucket,
      Key: filePath,
    }), { expiresIn: config.report.logTimeout });

    return cb(null, url);
  } catch (err) {
    return cb(err);
  }
};

export async function s3UploadVerification(body, filePath, cb) {
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: config.ageVerification.bucket,
      Key: filePath,
      Body: body,
      CacheControl: 'public, max-age=86400',
    }));

    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: config.ageVerification.bucket,
      Key: filePath,
    }), { expiresIn: config.ageVerification.timeout });

    return cb(null, url);
  } catch (err) {
    return cb(err);
  }
};

export function s3RemoveObject(bucketName, object, cb) {
  s3Client.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: object,
  }))
    .then(data => cb(null, data))
    .catch(err => cb(err));
};


export function createError(name, message) {
  const err = new Error();
  err.message = message;
  err.name = name;
  return err;
};

export function getHostDomain(req) {
  if (config.env === 'development') {
    return `http://localhost:${config.port}`;
  }

  const protocol = 'https';
  const hostname = process.env.DEPLOY_LOCATION === 'production'
    ? 'jumpin.chat'
    : 'local.jumpin.chat';

  return `${protocol}://${hostname}`;
};

export function destroySocketConnection(io, socketId) {
  io.in(socketId).disconnectSockets(true);
  return Promise.resolve();
};

export function getIpFromSocket(socket) {
  if (socket.handshake.headers['x-forwarded-for']) {
    return socket.handshake.headers['x-forwarded-for']
      .split(',')
      .map(s => s.trim())[0];
  }

  return socket.handshake.address;
};

export default { validateSession, validateAccount, verifyInternalSecret, messageFactory, rateLimit, updateLastSeen, convertImages, mergeBuffers, s3Upload, isValidImage, getExtFromMime, getRemoteIpFromReq, createNotification, getCookie, verifyAdmin, verifySiteMod, getSocketRooms, uploadDataUriToS3, s3UploadVerification, s3RemoveObject, createError, getHostDomain, destroySocketConnection, getIpFromSocket };
