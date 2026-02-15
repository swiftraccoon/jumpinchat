import axios from 'axios';
import logFactory from '../../utils/logger.js';
import { api } from '../../constants/constants.js';

const log = logFactory({ name: 'routes.verifyEmail' });

export default async function verifyEmail(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.section = 'Verify Email';
  locals.user = req.user;
  locals.errors = null;
  locals.success = null;

  // Init phase - verify the email token
  try {
    const response = await axios({
      method: 'GET',
      url: `${api}/api/user/verify/email/${req.params.token}`,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      if (response.data && response.data.message) {
        log.error({ err: response.data.message }, 'error verifying email');
        locals.errors = response.data.message;
      } else {
        locals.errors = 'Failed to validate your email, sorry!';
      }
    } else {
      locals.success = 'Your email has been verified, thanks!';
    }
  } catch (err) {
    log.error('error happened', err);
    return res.status(500).send();
  }

  // Render the view
  return res.render('verifyEmail');
}
