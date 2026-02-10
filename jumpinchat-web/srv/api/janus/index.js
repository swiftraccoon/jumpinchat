/**
 * Created by Zaccary on 14/12/2015.
 */


import express from 'express';
import controller from './janus.controller.js';
import utils from '../../utils/utils.js';
import handleJanusEvents from './controllers/handleJanusEvents.controller.js';
import getJanusToken from './controllers/getJanusToken.controller.js';
const router = express.Router();

router.get('/endpoints', utils.validateSession, controller.getJanusEndpoints);
router.get('/token', utils.validateSession, getJanusToken);
router.post('/events', handleJanusEvents);

export default router;
