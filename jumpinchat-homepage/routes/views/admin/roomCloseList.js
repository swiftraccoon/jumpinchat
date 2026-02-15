import jwt from 'jsonwebtoken';
import logFactory from '../../../utils/logger.js';
import config from '../../../config/index.js';
import { RoomClosures } from '../../../models/index.js';

const log = logFactory({ name: 'routes.adminRoomCloseList' });

export default async function adminRoomCloseList(req, res) {
  const { locals } = res;

  locals.section = 'Admin | Room closures';
  locals.page = 'roomclosures';
  locals.user = req.user;
  locals.roomCloses = [];

  // Init phase
  const token = jwt.sign({ userId: String(locals.user._id) }, config.auth.jwtSecret, { expiresIn: '1h' });
  const roomCloses = await RoomClosures
    .find({})
    .sort('-createdAt');

  locals.roomCloses = roomCloses;

  return res.render('admin/roomCloseList');
}
