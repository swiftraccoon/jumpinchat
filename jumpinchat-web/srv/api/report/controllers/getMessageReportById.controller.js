const log = require('../../../utils/logger.util')({ name: 'getMessageReportById' });
const messageReportModel = require('../messageReport.model');
const errors = require('../../../config/constants/errors');

module.exports = function getMessageReportById(req, res) {
  const { reportId } = req.params;

  return messageReportModel
    .findOne({ _id: reportId })
    .populate({
      path: 'message',
      select: ['recipient', 'sender', '_id', 'message'],
    })
    .exec()
    .then((result) => res.status(200).send(result))
    .catch((err) => {
      log.fatal({ err }, 'failed to fetch reports');
      res.status(500).send(errors.ERR_SRV);
    });
};
