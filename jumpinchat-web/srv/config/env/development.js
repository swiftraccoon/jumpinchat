export default {
  appPath: 'react-client',
  analytics: {
    fb: '',
    ga: '',
  },
  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost/tc',
    options: {
      maxPoolSize: process.env.MONGODB_POOL || 10,
      autoIndex: true,
    },
  },
  redis: {
    uri: process.env.REDIS_URI || 'redis://localhost:6379',
    socketExpire: 60 * 60 * 10,
    lastSeenExpire: 60,
  },
  janus: {
    ws_uri_internal: process.env.JANUS_WS_URI_INTERNAL || ':8188',
    http_uri_internal: process.env.JANUS_HTTP_URI_INTERNAL || ':8088/janus',
    http_uri: process.env.JANUS_HTTP_URI || ':8088/janus',
    http_admin_uri_internal: process.env.JANUS_ADMIN_HTTP_URI_INTERNAL || 'http://localhost:7888/admin',
    ws_uri: process.env.JANUS_WS_URI || ':8188',
    wss_uri: process.env.JANUS_WSS_URI || '/janus/ws',
    https_uri: process.env.JANUS_HTTPS_URI || '/janus/http',
    serverIds: process.env.JANUS_SERVER_IDS
      ? process.env.JANUS_SERVER_IDS.split(',')
      : ['janus'],
    room: {
      bitrate: parseInt(process.env.JANUS_BITRATE, 10) || 128 * 1000,
      roomSize: parseInt(process.env.JANUS_ROOM_SIZE, 10) || 12,
      codec: process.env.JANUS_CODEC || 'vp8',
    },
    token: {
      expire: 60 * 60 * 24,
      secret: process.env.JANUS_TOKEN_SECRET || 'janus',
      plugins: process.env.JANUS_PLUGINS || 'janus.plugin.videoroom',
    },
  },
  turn: {
    uris: [
      'turn.jumpin.chat',
    ],
    ttl: process.env.TURN_TTL || 60 * 60 * 24,
  },
  auth: {
    sharedSecret: 'secret',
    cookieSecret: 'foo',
    secureSessionCookie: false,
    jwt_secret: 'jwtsecret',
    turnSecret: 'janus',
    fileTokenSecret: process.env.FILE_TOKEN_SECRET || 'dev-file-token-secret',
    activityTokenTimeout: 1000 * 60 * 60 * 24,
    cookieTimeout: 1000 * 60 * 60 * 24 * 180,
    rateLimitDuration: 1000 * 10,
  },
  room: {
    banTimeout: 1000 * 60 * 60 * 24,
    guestModTimeout: 1000 * 60 * 60 * 24,
    ignoreTimeout: 1000 * 60 * 5,
    historyTimeout: 60,
    defaultSilenceTimeout: 30,
    floodTimeout: 10, // 10 seconds
    floodRefresh: 2,
    floodLimit: 5,
    banLimit: 4464, // hours
  },
  uploads: {
    basePath: process.env.UPLOAD_BASE_PATH || '/data/uploads',
  },
  report: {
    logTimeout: 60 * 10,
    limit: 2,
    limitExpire: 60 * 3,
  },
  ageVerification: {
    timeout: 60 * 60 * 24,
    deniedTimeout: 1000 * 60 * 60 * 24 * 14,
  },
  verification: {
    emailTimeout: 1000 * 60 * 60 * 1,
    pwResetTimeout: 1000 * 60 * 60 * 1,
  },
  emailServiceUri: process.env.EMAIL_URL || 'http://localhost:3434',
  yt: {
    keys: (process.env.YT_API_KEY || '').split(',').filter(Boolean),
    key: process.env.YT_API_KEY || 'foo',
    cacheExpire: 60 * 10,
    detailCacheExpire: 60 * 10,
  },
  siteban: {
    defaultExpire: 60 * 5,
  },
  admin: {
    stats: {
      ttl: 60 * 15,
    },
  },
  push: {
    publicKey: '',
    privateKey: '',
    gcmAPIKey: process.env.GCM_API_KEY,
  },
  payment: {
    stripe: {
      secretKey: process.env.STRIPE_SK || '',
      whKey: process.env.STRIPE_WH_KEY || '',
    },
  },
  messages: {
    cacheTimeout: 5,
    pageSize: 20,
    convoListSize: 10,
  },
  slack: {
    hookUrl: '',
  },
};
