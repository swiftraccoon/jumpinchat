
import path from 'path';
import axios from 'axios';
import user from './api/user/index.js';
import room from './api/room/index.js';
import janus from './api/janus/index.js';
import turn from './api/turn/index.js';
import admin from './api/admin/index.js';
import youtube from './api/youtube/index.js';
import report from './api/report/index.js';
import trophy from './api/trophy/index.js';
import message from './api/message/index.js';
import ageVerification from './api/ageVerification/index.js';
import payment from './api/payment/index.js';
import role from './api/role/index.js';
import config from './config/env/index.js';
import roomUtils from './api/room/room.utils.js';
import logFactory from './utils/logger.util.js';
const log = logFactory({ name: 'routes' });
export default function routes(app) {
  app.use('/api/user', user);
  app.use('/api/rooms', room);
  app.use('/api/janus', janus);
  app.use('/api/turn', turn);
  app.use('/api/admin', admin);
  app.use('/api/youtube', youtube);
  app.use('/api/report', report);
  app.use('/api/trophy', trophy);
  app.use('/api/ageverify', ageVerification);
  app.use('/api/payment', payment);
  app.use('/api/message', message);
  app.use('/api/role', role);

  app.get('/api/status', (req, res) => res.status(200).send('It\'s all good'));
  app.post('/api/donate', (req, res) => {
    try {
      const data = JSON.parse(req.body.data);

      const {
        from_name: fromName,
        message: msg,
        amount,
      } = data;

      const slackHookUrl = 'https://hooks.slack.com/services/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';
      const text = `${fromName} donated $${amount}`;
      const payload = {
        username: 'Ko-fi',
        channel: '#general',
        icon_url: 'https://s3-us-west-2.amazonaws.com/slack-files2/avatar-temp/2018-05-20/367806459094_6a252d08d5880d6ba7ed.png',
        attachments: [
          {
            pretext: text,
            fallback: text,
          },
        ],
      };

      if (msg) {
        payload.attachments[0].fields = [
          {
            title: 'Message',
            value: msg,
          },
        ];
      }

      return axios.post(slackHookUrl, payload)
        .then(() => {
          res.status(200).send();
        })
        .catch((err) => {
          const status = err.response && err.response.status;
          log.fatal({ err, statusCode: status }, 'error posting slack webhook');
          return res.status(status || 500).send();
        });
    } catch (e) {
      log.fatal({ err: e }, 'error parsing body');
      return res.status(400).send();
    }
  });

  app.route('/favicon.ico')
    .get((req, res, next) => {
      log.debug('favicon', req.url);
      next();
    });

  app.route('/register')
    .get((req, res) => {
      res.render('register');
    });

  app.route('/login')
    .get((req, res) => {
      res.render('login');
    });


  app.route('/:room/manifest.json')
    .get((req, res) => {
      const roomName = req.params.room;
      const manifest = {
        short_name: roomName,
        name: `${roomName} | JumpInChat`,
        icons: [
          {
            src: '/img/jic-logo-144x144.png',
            type: 'image/png',
            sizes: '144x144',
          },
          {
            src: '/img/jic-logo-192x192.png',
            type: 'image/png',
            sizes: '192x192',
          },
          {
            src: '/img/jic-logo-512x512.png',
            type: 'image/png',
            sizes: '512x512',
          },
        ],
        start_url: `/${roomName}/?utm_source=${roomName}&utm_medium=homescreen`,
        background_color: '#22ADD5',
        theme_color: '#22ADD5',
        display: 'standalone',
      };

      try {
        return res.status(200).send(JSON.stringify(manifest));
      } catch (err) {
        log.fatal({ err }, 'Error creating manifest');
        return res.status(500).send();
      }
    });

  app.route('/:room').post((req, res) => res.redirect(302, req.path));

  app.route('/:room')
    .get((req, res, next) => {
      const roomName = req.params.room.toLowerCase().replace('-', '');

      if (req.params.room.match(/[A-Z-]/)) {
        return res.redirect(301, roomName);
      }

      log.debug({ roomName }, 'connecting to room');

      if (roomName !== 'socket.io-client' && roomName !== 'api') {
        log.debug({ roomName }, 'rendering room');

        const roomTitle = `${roomName} | JumpInChat`;

        roomUtils.getRoomByName(roomName, (err, existingRoom) => {
          if (err) {
            log.fatal({ err, room: roomName }, 'error getting room');
            return res.redirect(302, '/500');
          }

          let roomObj = existingRoom;

          if (!roomObj) {
            roomObj = {
              name: roomName,
              settings: {},
            };
          }

          let roomDescription = 'JumpInChat is a free and simple way to create video chat rooms. No downloads, no Flash, just your Browser! Find a chat room or create your own and start chatting instantly!';

          let roomDisplay = 'https://jumpin.chat/images/jiclogo_320x320.png';

          if (roomObj.settings.description) {
            roomDescription = `JumpInChat: Simple video chat rooms | ${roomObj.settings.description}`;
          }

          if (roomObj.settings.display) {
            roomDisplay = `https://s3.amazonaws.com/jic-uploads/${roomObj.settings.display}`;
          }

          return res.render(path.join(config.root, config.appPath, 'index.ejs'),
            {
              roomTitle,
              roomDisplay,
              roomDescription,
              room: roomObj,
              gaId: config.analytics.ga,
              fbId: config.analytics.fb,
            }, (err, html) => {
              if (err) {
                log.fatal({ err }, 'error rendering room');
              }

              return res.status(200).send(html);
            });
        });
      } else {
        return next();
      }
    });

  app.route('/{*splat}')
    .get((req, res, next) => {
      res.status(404);

      log.debug({ url: req.originalUrl }, 'route not found');

      if (req.accepts('html')) {
        return res.render('404');
      }

      if (req.accepts('json')) {
        return res.send({ error: 'route not found' });
      }

      return next();
    });
};
