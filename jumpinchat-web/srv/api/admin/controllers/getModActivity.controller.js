
import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import adminUtils from '../admin.utils.js';
const log = logFactory({ name: 'getModActivity.controller' });
export default async function getModActivity(req, res) {
  const { page } = req.query;
  const countPerPage = config.admin.userList.itemsPerPage;
  const start = ((page - 1) * countPerPage);
  let count;

  try {
    count = await adminUtils.getModActivityCount();
  } catch (err) {
    log.fatal({ err }, 'failed to get mod activity count');
    return res.status(500).send(err);
  }

  try {
    const activity = await adminUtils.getModActivity(start, countPerPage);
    return res.status(200).send({
      count,
      activity,
    });
  } catch (err) {
    log.fatal({ err }, 'failed to get mod activity');
    return res.status(500).send(err);
  }
};
