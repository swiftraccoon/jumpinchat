import { checkUserSession, noFollow, validateUserIsAdmin, validateUserIsSiteMod } from './middleware.js';
import removeIgnore from './removeIgnore.js';
import generateSitemap from './generateSitemap.js';

// View handlers
import indexView from './views/index.js';
import loginView from './views/login.js';
import registerView from './views/register.js';
import mfaVerifyView from './views/mfaVerify.js';
import directoryView from './views/directory.js';
import settingsView from './views/settings.js';
import profileView from './views/profile.js';
import verifyEmailView from './views/verifyEmail.js';
import resetPasswordRequestView from './views/resetPasswordRequest.js';
import resetPasswordView from './views/resetPassword.js';
import helpView from './views/help.js';
import contactView from './views/contact.js';
import ageVerifyView from './views/ageVerify.js';
import ageVerificationSuccessView from './views/ageVerificationSuccess.js';
import supportView from './views/support.js';
import paymentView from './views/payment.js';
import paymentSuccessView from './views/paymentSuccess.js';
import paymentFailureView from './views/paymentFailure.js';
import mfaEnrollView from './views/mfaEnroll.js';
import mfaEnrollBackupCodesView from './views/mfaEnrollBackupCodes.js';
import adminView from './views/admin.js';
import adminRoomDetailsView from './views/adminRoomDetails.js';
import adminRoomUserDetailsView from './views/adminRoomUserDetails.js';
import adminUserDetailsView from './views/adminUserDetails.js';
import adminReportDetailsView from './views/adminReportDetails.js';
import adminAgeVerificationDetailsView from './views/adminAgeVerificationDetails.js';
import adminBanListView from './views/adminBanList.js';
import adminBanDetailsView from './views/adminBanDetails.js';
import termsView from './views/terms.js';
import privacyView from './views/privacy.js';

// Nested view handlers
import accountSettingsView from './views/settings/account.js';
import communicationView from './views/admin/communication.js';
import messageReportListView from './views/admin/messageReportList.js';
import messageReportDetailsView from './views/admin/messageReportDetails.js';
import roomCloseListView from './views/admin/roomCloseList.js';
import roomCloseDetailView from './views/admin/roomCloseDetail.js';
import siteModsView from './views/admin/siteMods.js';
import modActivityView from './views/admin/modActivity.js';
import inboxView from './views/messages/inbox.js';
import composeView from './views/messages/compose.js';
import roomInfoView from './views/room/settings/info.js';
import roomEmojiView from './views/room/settings/emoji.js';
import conductView from './views/sitemod/conduct.js';
import sitemodReportListView from './views/sitemod/reportList.js';
import sitemodReportDetailsView from './views/sitemod/reportDetails.js';

// Setup Route Bindings
export default function routes(app) {
  // Views
  app.all('/', indexView);
  app.all('/login', loginView);
  app.all('/login/totp', mfaVerifyView);
  app.all('/register', registerView);
  app.all('/directory', directoryView);
  app.all('/:roomName/settings', (req, res) => res.redirect('settings/info'));
  app.all('/:roomName/settings/info', roomInfoView);
  app.all('/:roomName/settings/emoji', roomEmojiView);
  app.all('/settings/account/mfa', mfaEnrollView);
  app.all('/settings/account/mfa/backup', mfaEnrollBackupCodesView);
  app.all('/settings/account', accountSettingsView);
  app.delete('/settings/ignore', checkUserSession, removeIgnore);
  app.all('/settings/{/:page}', settingsView);
  app.all('/profile/{/:username}', profileView);
  app.get('/verify-email/:token', verifyEmailView);
  app.all('/password-reset/request', resetPasswordRequestView);
  app.all('/password-reset/reset/:token', resetPasswordView);
  app.all('/help/{/:page}', helpView);
  app.all('/contact', contactView);
  app.all('/ageverify', ageVerifyView);
  app.get('/ageverify/success', ageVerificationSuccessView);
  app.all('/support', supportView);
  app.all('/support/payment', paymentView);
  app.all('/support/payment/success', paymentSuccessView);
  app.all('/support/payment/failed', paymentFailureView);
  app.all('/messages', inboxView);
  app.all('/messages/:recipient', composeView);


  app.all('/admin/communication', noFollow, validateUserIsAdmin, communicationView);
  app.all('/admin/rooms/:room', noFollow, validateUserIsAdmin, adminRoomDetailsView);
  app.all('/admin/rooms/:room/:userListId', noFollow, validateUserIsAdmin, adminRoomUserDetailsView);
  app.all('/admin/users/:userId', noFollow, validateUserIsAdmin, adminUserDetailsView);
  app.all('/admin/reports/messages', noFollow, validateUserIsAdmin, messageReportListView);
  app.all('/admin/reports/messages/:reportId', noFollow, validateUserIsAdmin, messageReportDetailsView);
  app.all('/admin/reports/:reportId', noFollow, validateUserIsAdmin, adminReportDetailsView);
  app.all('/admin/ageverify/:requestId', noFollow, validateUserIsAdmin, adminAgeVerificationDetailsView);
  app.all('/admin/banlist', noFollow, validateUserIsAdmin, adminBanListView);
  app.all('/admin/banlist/:banId', noFollow, validateUserIsAdmin, adminBanDetailsView);
  app.all('/admin/roomclosures', noFollow, validateUserIsAdmin, roomCloseListView);
  app.all('/admin/roomclosures/:closeId', noFollow, validateUserIsAdmin, roomCloseDetailView);
  app.all('/admin/sitemods', noFollow, validateUserIsAdmin, siteModsView);
  app.all('/admin/sitemods/activity', noFollow, validateUserIsAdmin, modActivityView);
  app.all('/admin/{/:page}', noFollow, validateUserIsAdmin, adminView);

  app.all('/sitemod', noFollow, validateUserIsSiteMod,
    (req, res) => res.redirect('/sitemod/conduct'));
  app.all('/sitemod/conduct', noFollow, validateUserIsSiteMod, conductView);
  app.all('/sitemod/reports', noFollow, validateUserIsSiteMod, sitemodReportListView);
  app.all('/sitemod/reports/:reportId', noFollow, validateUserIsSiteMod, sitemodReportDetailsView);

  app.get('/logout', (req, res) => {
    res.clearCookie('jic.ident');
    res.clearCookie('jic.activity');
    res.locals.user = null;
    res.redirect('/');
  });

  app.get('/terms', termsView);
  app.get('/privacy', privacyView);
  app.post('/session/register', (req, res) => {
    req.session.fingerprint = req.body.fp;
    return res.status(200).send();
  });

  app.get('/sitemap.xml', generateSitemap);

  app.get('/404', (req, res) => res.status(404).render('errors/error', {
    code: 404,
    message: 'page could not be found, sorry',
  }));

  app.get('/500', (req, res) => res.status(500).render('errors/error', {
    code: 500,
    message: 'The site has experienced an error, the admin will be shouted at shortly.',
  }));

  app.get('/502', (req, res) => res.status(502).render('errors/error', {
    code: 502,
    message: 'Looks like that part of the site was down, the admin will be shouted at shortly.',
  }));
}
