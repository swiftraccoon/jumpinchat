
import logFactory from '../../../utils/logger.util.js';
import errors from '../../../config/constants/errors.js';
import reportUtils from '../report.utils.js';
import { resolutionOutcomes } from '../report.constants.js';
const log = logFactory({ name: 'setReportResolved' });
export default async function setReportResolved(req, res) {
  const {
    reportId,
  } = req.body;

  try {
    await reportUtils.resolveReport(reportId, req.user._id, resolutionOutcomes.RESOLUTION_NONE);
    log.info({ reportId }, 'report resolved');
    return res.status(200).send();
  } catch (err) {
    log.fatal({ err }, 'failed to resolve report');
    if (err.name === 'MissingValueError') {
      return res.status(404).send(err);
    }

    return res.status(500).send(errors.ERR_SRV);
  }
};
