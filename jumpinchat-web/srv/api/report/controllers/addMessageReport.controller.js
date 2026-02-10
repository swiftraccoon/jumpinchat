import messageReportModel from '../messageReport.model.js';
import logFactory from '../../../utils/logger.util.js';
import email from '../../../config/email.config.js';
import { getMessageById } from '../../message/message.utils.js';
const log = logFactory({ name: 'addMessageReport' });
import { messageReportTemplate } from '../../../config/constants/emailTemplates.js';

export default async function addMessageReport(req, res) {
  const {
    messageId,
    reason,
  } = req.body;

  let message;
  try {
    message = await getMessageById(messageId);

    if (!message) {
      return res.status(404).send({
        message: 'Message not found',
      });
    }
  } catch (err) {
    log.fatal({ err }, 'failed to create message report');
    return res.status(500).send();
  }

  try {
    const createdReport = await messageReportModel.create({
      reason,
      message: messageId,
    });

    log.debug({ createdReport, message });

    email.sendMail({
      to: 'contact@example.com',
      subject: `Message report: ${message.sender.username}->${message.recipient.username}`,
      html: messageReportTemplate(createdReport),
    }, (err) => {
      if (err) {
        log.fatal({ err }, 'failed to send report email');
        return;
      }

      log.info({ reportId: createdReport._id }, 'report email sent');
    });

    return res.status(201).send();
  } catch (err) {
    log.fatal({ err }, 'failed to create message report');
    return res.status(500).send();
  }
};
