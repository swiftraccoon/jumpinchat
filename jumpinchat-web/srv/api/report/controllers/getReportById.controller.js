
import logFactory from '../../../utils/logger.util.js';
import reportModel from '../report.model.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'getReportById' });
export default function getReports(req, res) {
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
