const auth = require('./utils/auth');
const email = require('./api/email');

module.exports = function routes(app, options = {}) {
  app.use('/status', (req, res) => res.status(200).send('it\'s all good'));
  app.use('/email', auth.createAuth(options.sharedSecret), email.createRouter(options));
};
