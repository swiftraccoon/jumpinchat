import express from 'express';
import addReport from './controllers/addReport.controller.js';
import addMessageReport from './controllers/addMessageReport.controller.js';
import getReports from './controllers/getReports.controller.js';
import getReportById from './controllers/getReportById.controller.js';
import getMessageReports from './controllers/getMessageReports.controller.js';
import getMessageReportById from './controllers/getMessageReportById.controller.js';
import setReportResolved from './controllers/setReportResolved.controller.js';
import {
  validateSession,
  validateAccount,
  verifyAdmin,
  verifySiteMod,
  rateLimit,
} from '../../utils/utils.js';

const router = express.Router();

router.post('/', rateLimit, validateSession, addReport);
router.post('/message', validateAccount, addMessageReport);
router.get('/', verifySiteMod, getReports);
router.get('/message', verifyAdmin, getMessageReports);
router.get('/message/:reportId', verifyAdmin, getMessageReportById);
router.get('/:reportId', verifySiteMod, getReportById);
router.post('/resolve', verifySiteMod, setReportResolved);

export default router;
