/**
 * Created by vivaldi on 08/11/2014.
 */


import express from 'express';
import settings from './controllers/user.settings.js';
import utils from '../../utils/utils.js';
import config from '../../config/env/index.js';
import controller from './user.controller.js';
import uploadDisplayImage from './controllers/user.uploadDisplayImage.js';
import verifyEmail from './controllers/user.verifyEmail.js';
import requestVerifyEmail from './controllers/user.requestVerifyEmail.js';
import resetPasswordRequest from './controllers/user.resetPasswordRequest.js';
import resetPasswordVerify from './controllers/user.resetPasswordVerify.js';
import resetPassword from './controllers/user.resetPassword.js';
import contactForm from './controllers/user.contact.js';
import setNotificationsEnabled from './controllers/user.setNotificationsEnabled.js';
import changeEmail from './controllers/user.changeEmail.js';
import removeUser from './controllers/user.remove.js';
import unsubscribe from './controllers/user.unsubscribe.js';
import checkBroadcastRestrictions from './controllers/user.checkBroadcastRestrictions.js';
import setLayout from './controllers/user.setLayout.js';
import setTheme from './controllers/user.setTheme.js';
import getProfile from './controllers/user.getProfile.js';
import uploadVerification from './controllers/user.uploadVerification.js';
import uploadUserIcon from './controllers/user.uploadUserIcon.js';
import setBroadcastQuality from './controllers/user.setBroadcastQuality.js';
import getUserByName from './connectors/getUserByName.connector.js';
import mfaRequestEnroll from './connectors/mfaRequestEnroll.connector.js';
import mfaConfirmEnroll from './connectors/mfaConfirmEnroll.connector.js';
import mfaValidate from './connectors/mfaValidate.connector.js';
import mfaGenBackupCodes from './connectors/mfaGenBackupCodes.connector.js';
import mfaDisable from './connectors/mfaDisable.connector.js';
const router = express.Router();


router.post('/session', controller.createSession);
router.post('/:id/settings', utils.validateAccount, settings);
router.post('/register', utils.rateLimit, controller.createUser);
router.post('/login', utils.rateLimit, controller.login);
router.post('/logout', controller.logout);
router.get('/checkCanBroadcast{/:roomName}', checkBroadcastRestrictions);
router.put('/:userId/uploadImage', utils.validateAccount, uploadDisplayImage);
router.put('/:userId/uploadUserIcon', utils.validateAccount, uploadUserIcon);
router.put('/:userId/setnotifications', utils.validateAccount, setNotificationsEnabled);
router.put('/:userId/changeEmail', utils.validateAccount, changeEmail);
router.get('/:userId/profile', utils.validateSession, getProfile);
router.delete('/:userId/remove', utils.validateAccount, removeUser);
router.get('/unsubscribe/:token', unsubscribe);
router.put('/:userId/theme', utils.validateAccount, setTheme);
router.post('/:userId/age-verify/upload', utils.validateAccount, uploadVerification);
router.put('/setBroadcastQuality', utils.validateAccount, setBroadcastQuality);
router.put('/setLayout', utils.validateAccount, setLayout);

router.get('/:username', utils.validateAccount, utils.rateLimit, getUserByName);

router.post('/verify/email', utils.rateLimit, requestVerifyEmail);
router.get('/verify/email/:token', verifyEmail);

router.post('/password/request', resetPasswordRequest);
router.get('/password/reset/:token', resetPasswordVerify);
router.post('/password/reset', resetPassword);

router.get('/mfa/request', utils.validateAccount, mfaRequestEnroll);
router.post('/mfa/confirm', utils.validateAccount, mfaConfirmEnroll);
router.post('/mfa/verify', utils.validateAccount, mfaValidate);
router.get('/mfa/backup', utils.validateAccount, mfaGenBackupCodes);
router.put('/mfa/disable', utils.validateAccount, mfaDisable);

router.get('/checkusername/:username', controller.checkUsername);
router.put('/socket/old/:oldId/new/:newId', controller.updateSession);
router.post('/hasremindedverify', utils.validateAccount, (req, res) => {
  const verifyReminderCookieName = 'jic.verifyReminder';
  if (!req.cookies[verifyReminderCookieName]) {
    res.cookie(verifyReminderCookieName, Date.now(), {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      secure: config.auth.secureSessionCookie,
      sameSite: 'lax',
    });
  }

  res.status(204).send();
});

router.post('/contact', contactForm);

export default router;
