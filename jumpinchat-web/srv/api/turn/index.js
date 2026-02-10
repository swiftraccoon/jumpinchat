/**
 * Created by Zaccary on 14/12/2015.
 */


import express from 'express';
import controller from './turn.controller.js';
const router = express.Router();


// TODO require an active session (unless request is from an internal address, e.g. janus)
router.get('/', controller.getTurnCreds);
router.post('/', controller.getTurnCreds);

export default router;
