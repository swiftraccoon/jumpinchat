/**
 * Created by Zaccary on 14/12/2015.
 */


import express from 'express';
import logFactory from '../../utils/logger.util.js';
import { verifyAdmin, verifySiteMod } from '../../utils/utils.js';
import controller from './admin.controller.js';
import sendBulkEmails from './controllers/sendBulkEmails.controller.js';
import bounceNotification from './controllers/bounceNotification.controller.js';
import openNotification from './controllers/openNotification.controller.js';
import removeUser from './controllers/removeUser.controller.js';
import siteBan from './controllers/siteBan.controller.js';
import getBanItem from './controllers/getBanItem.controller.js';
import closeRoom from './controllers/closeRoom.controller.js';
import getStats from './controllers/stats.controller.js';
import addSiteMod from './controllers/addSiteMod.controller.js';
import removeSiteMod from './controllers/removeSiteMod.controller.js';
import getSiteMods from './controllers/getSiteMods.controller.js';
import getModActivity from './controllers/getModActivity.controller.js';
const log = logFactory({ name: 'admin.api' });
const router = express.Router();

router.post('/notify/restart/:seconds', controller.notifyServerRestart);
router.post('/notify', controller.notify);
router.get('/rooms', verifyAdmin, controller.getActiveRooms);
router.get('/rooms/:roomId', verifyAdmin, controller.getRoomById);
router.get('/users', verifyAdmin, controller.getUserList);
router.delete('/users/remove/:userId', verifyAdmin, removeUser);
router.post('/email/send', verifyAdmin, sendBulkEmails);
router.post('/email/bounce', bounceNotification);
router.post('/email/open', openNotification);
router.post('/siteban', verifySiteMod, siteBan);
router.get('/siteban/:banId', verifySiteMod, getBanItem);
router.post('/rooms/:roomName/close', verifyAdmin, closeRoom);
router.get('/stats', verifyAdmin, getStats);
router.post('/sitemod', verifyAdmin, addSiteMod);
router.delete('/sitemod/:modId', verifyAdmin, removeSiteMod);
router.get('/sitemods', verifyAdmin, getSiteMods);
router.get('/modactivity', verifyAdmin, getModActivity);

export default router;
