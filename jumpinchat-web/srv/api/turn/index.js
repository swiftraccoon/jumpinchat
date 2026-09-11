/**
 * Created by Zaccary on 14/12/2015.
 */


import express from 'express';
import controller from './turn.controller.js';
import utils from '../../utils/utils.js';
const router = express.Router();


router.get('/', utils.validateSession, controller.getTurnCreds);
router.post('/', utils.validateSession, controller.getTurnCreds);

export default router;
