
import logFactory from '../../../utils/logger.util.js';
import messageReportModel from '../messageReport.model.js';
import errors from '../../../config/constants/errors.js';
const log = logFactory({ name: 'getMessageReportById' });
export default function getMessageReportById(req, res) {
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
