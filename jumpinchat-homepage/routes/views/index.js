import url from 'url';
import Joi from 'joi';
import logFactory from '../../utils/logger.js';
import { getRoomList, getRecentRooms } from '../../utils/roomUtils.js';
import { colours, errors } from '../../constants/constants.js';

const log = logFactory({ name: 'views.home' });

const generateLdJson = rooms => ({
  '@context': 'http://schema.org',
  '@type': 'ItemList',
  itemListElement: rooms.map((room, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: room.name,
    image: room.settings.display
      ? `/uploads/${room.settings.display}`
      : undefined,
    url: `https://jumpin.chat/${room.name}`,
    description: room.settings.description,
  })),
});

export default async function index(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Simple video chat rooms';
  locals.rooms = [];
  locals.recentRooms = [];
  locals.roomListError = false;
  locals.user = req.user;
  locals.ldJson = {};

  // Init phase
  if (req.user) {
    try {
      const recentRoomResponse = await getRecentRooms(req.user._id);
      if (recentRoomResponse) {
        locals.recentRooms = recentRoomResponse.rooms
          .filter(({ roomId: room }) => Boolean(room))
          .sort((a, b) => a.createdAt < b.createdAt)
          .map(({ roomId: room }, i) => {
            const broadcastingUsers = room.users.filter(u => u.isBroadcasting === true).length;
            return {
              ...room,
              color: colours[i % colours.length],
              attrs: {
                ...room.attrs,
                broadcastingUsers,
              },
            };
          });
      }
    } catch (err) {
      log.fatal({ err }, 'failed to get recent rooms');
      return res.status(500).send();
    }
  }

  // getRoomList uses callback style
  await new Promise((resolve, reject) => {
    getRoomList(0, 9, (err, data) => {
      if (err) {
        log.error({ err }, 'failed to get room list');
        return reject(err);
      }

      const { rooms } = data;
      locals.rooms = rooms;
      locals.ldJson = generateLdJson(rooms);
      return resolve();
    });
  }).catch(() => {
    // error already logged, continue to render
  });

  // GET action handling
  if (req.method === 'GET' && req.query.action === 'room.get') {
    return res.redirect(`/${req.query.roomname}`);
  }

  // POST handling
  if (req.method === 'POST' && req.body.action === 'custom') {
    const schema = Joi.object({
      amount: Joi.number().integer().min(3).max(50),
    });

    const { error, value } = schema.validate({ amount: req.body.amount });

    if (error) {
      log.error({ err: error }, 'error validating custom amount form');
      locals.error = errors.ERR_VALIDATION;
      return res.redirect(url.format({
        path: './',
        query: {
          error: locals.error,
        },
      }));
    }

    return res.redirect(`/support/payment?productId=onetime&amount=${value.amount * 100}`);
  }

  // Render the view
  return res.render('index');
}
