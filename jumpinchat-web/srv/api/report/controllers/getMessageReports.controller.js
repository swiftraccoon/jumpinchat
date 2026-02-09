const log = require('../../../utils/logger.util')({ name: 'getMessageReports' });
const config = require('../../../config/env');
const messageReportModel = require('../messageReport.model');
const errors = require('../../../config/constants/errors');

module.exports = async function getMessageReports(req, res) {
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
