
import express from 'express';
import { verifyAdmin } from '../../utils/utils.js';
import getVerificationRequests from './controllers/getVerificationRequests.js';
import getVerificationRequest from './controllers/getVerificationRequest.js';
import updateRequest from './controllers/updateRequest.js';
const router = express.Router();


router.get('/', verifyAdmin, getVerificationRequests);
router.get('/:id', verifyAdmin, getVerificationRequest);
router.put('/:id', verifyAdmin, updateRequest);

export default router;
