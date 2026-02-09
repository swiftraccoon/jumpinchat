const log = require('../../../utils/logger.util')({ name: 'getReportById' });
const reportModel = require('../report.model');
const errors = require('../../../config/constants/errors');

module.exports = function getReports(req, res) {
  const { reportId } = req.params;

  return reportModel
    .findOne({ _id: reportId })
    .where('active').equals(true)
    .populate({
      path: 'resolution.resolvedBy',
      select: ['username', 'profile.pic'],
    })
    .exec()
    .then((result) => res.status(200).send(result))
    .catch((err) => {
      log.fatal({ err }, 'failed to fetch report');
      res.status(500).send(errors.ERR_SRV);
    });
};
