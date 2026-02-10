
import userModel from '../api/user/user.model.js';
import logFactory from '../utils/logger.util.js';
const log = logFactory({ name: 'migrateUserDocuments' });
export default function migrateUsers() {
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
