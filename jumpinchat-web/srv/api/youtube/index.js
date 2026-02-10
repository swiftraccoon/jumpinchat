

import express from 'express';
import utils from '../../utils/utils.js';
import SearchYoutube from './controllers/search.controller.js';
import setPlay from './controllers/setPlay.controller.js';
import getPlaylist from './controllers/getPlaylist.controller.js';
const search = new SearchYoutube();
const router = express.Router();

router.get('/search/:term', utils.validateAccount, (req, res) => search.sendRequest(req, res));

router.put('/playvideos', utils.validateSession, setPlay);
router.get('/:roomName/playlist', utils.validateSession, getPlaylist);

export default router;
