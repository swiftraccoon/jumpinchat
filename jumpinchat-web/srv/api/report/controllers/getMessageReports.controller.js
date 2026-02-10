
import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import messageReportModel from '../messageReport.model.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'getMessageReports' });
export default async function getMessageReports(req, res) {
  const { page } = req.query;
  const countPerPage = config.admin.userList.itemsPerPage;
  const start = ((page - 1) * countPerPage);

  const reportCount = await messageReportModel.countDocuments().exec();
  return messageReportModel.find()
    .sort('-createdAt')
    .skip(start)
    .limit(countPerPage)
    .populate({
      path: 'message',
      select: ['recipient', 'sender', '_id'],
    })
    .exec()
    .then((result) => {
      res.status(200).send({
        reports: result,
        count: reportCount,
      });
    })
    .catch((err) => {
      log.fatal({ err }, 'failed to fetch reports');
      res.status(500).send(errors.ERR_SRV);
    });
};
