
import logFactory from '../../../utils/logger.util.js';
import { getBanlistItemById } from '../../siteban/siteban.utils.js';
const log = logFactory({ name: 'admin.getBanItem' });
export default async function getBanItem(req, res) {
  const { banId } = req.params;
  try {
    const item = await getBanlistItemById(banId);
    return res.status(200).send(item);
  } catch (err) {
    log.fatal({ err, banId }, 'failed to get ban list item');
    return res.status(500).send(err);
  }
};
