import logFactory from '../../../utils/logger.js';
import { RoomClosures } from '../../../models/index.js';

const log = logFactory({ name: 'routes.roomCloseDetail' });

export default async function adminRoomCloseDetail(req, res) {
  const { locals } = res;
  const { closeId } = req.params;

  locals.section = `Admin | Room closures ${closeId}`;
  locals.page = 'roomclosures';
  locals.user = req.user;
  locals.banlist = [];

  // Init phase
  const close = await RoomClosures.findOne({ _id: closeId });
  locals.close = close;

  return res.render('admin/roomCloseDetail');
}
