const userModel = require('../api/user/user.model');
const log = require('../utils/logger.util')({ name: 'migrateUserDocuments' });

module.exports = function migrateUsers() {
  return userModel.find({}).exec()
    .then((users) => {
      users.forEach(u => u.save()
        .then(() => log.debug('updated user doc'))
        .catch((saveErr) => log.fatal({ err: saveErr }, 'error saving user')));
    })
    .catch((err) => {
      log.fatal({ err }, 'error fetching users');
    });
};
