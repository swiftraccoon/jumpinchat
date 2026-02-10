/**
 * Created by vivaldi on 08/11/2014.
 */




import express from 'express';
import config from '../../config/env/index.js';
import controller from './room.controller.js';
import utils from '../../utils/utils.js';
import uploadDisplayPic from './controllers/room.uploadDisplayPic.js';
import registerPush from './controllers/room.registerPush.js';
import infoRead from './controllers/room.infoRead.js';
import submitRoomPassword from './controllers/room.submitRoomPassword.js';
import setAgeRestricted from './controllers/room.setAgeRestricted.js';
import uploadEmoji from './controllers/room.uploadEmoji.js';
import getEmoji from './controllers/room.getEmoji.js';
import removeEmoji from './controllers/room.removeEmoji.js';
import getRoomList from './controllers/room.getRoomList.js';
import roomSanitize from './connectors/room.sanitize.connector.js';
import migrateMissingRooms from '../../migrations/rooms/missingRooms.js';
const router = express.Router();


router.get('/public', utils.verifyInternalSecret, getRoomList);
router.post('/:room/password', utils.validateSession, submitRoomPassword);
router.get('/:roomName/emoji', getEmoji);
router.get('/:room', utils.validateSession, controller.getRoom);
router.put('/:room/uploadImage', utils.validateAccount, uploadDisplayPic);
router.post('/push/:socketId/register', utils.validateSession, registerPush);
router.get('/push/publickey', utils.validateSession, (req, res) => {
  res.status(200).send({ key: config.push.publicKey });
});
router.put('/:roomName/sanitize', utils.verifyInternalSecret, roomSanitize);
router.put('/:room/inforead', utils.validateAccount, infoRead);
router.put('/:roomName/setAgeRestricted', utils.validateAccount, setAgeRestricted);
router.post('/:roomName/uploadEmoji', utils.validateAccount, uploadEmoji);
router.delete('/emoji/:emojiId', utils.validateAccount, removeEmoji);
router.post('/migrate/missingRooms', (req, res) => {
  migrateMissingRooms();
  return res.status(200).send();
});
router.post('/confirmAge', utils.validateSession, (req, res) => {
  req.session.ageConfirmed = true;
  return res.status(200).send();
});

export default router;
