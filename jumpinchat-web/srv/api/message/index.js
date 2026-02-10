


import express from 'express';
import utils from '../../utils/utils.js';
import retrieveConversations from './controllers/retrieveConversations.controller.js';
import singleConversation from './controllers/singleConversation.controller.js';
import addMessage from './controllers/addMessage.controller.js';
import getUnread from './controllers/getUnread.controller.js';
import markRead from './controllers/markRead.controller.js';
import markAllRead from './controllers/markAllRead.controller.js';
import adminMessageAll from './controllers/adminMessageAll.controller.js';
import archiveMessages from './controllers/archiveMessages.controller.js';
import migrateConvoId from '../../migrations/messages/conversationId.js';
const router = express.Router();

router.post('/admin/send', utils.verifyAdmin, adminMessageAll);
router.get('/:userId', utils.validateAccount, retrieveConversations);
router.get('/:userId/unread', utils.validateAccount, getUnread);
router.get('/:userId/:participantId', utils.validateAccount, singleConversation);
router.put('/read', utils.validateAccount, markAllRead);
router.put('/read/:userId/:participantId', utils.validateAccount, markRead);
router.put('/archive/:userId/:participantId', utils.validateAccount, archiveMessages);

router.post('/:recipient', utils.validateAccount, addMessage);

router.post('/migrate/conversationId', (req, res) => {
  migrateConvoId();
  return res.status(200).send();
});

export default router;
