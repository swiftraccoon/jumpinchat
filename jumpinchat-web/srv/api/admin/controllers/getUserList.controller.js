/**
 * Created by Zaccary on 25/07/2016.
 */


import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import UserUtils from '../../user/user.utils.js';
const log = logFactory({ name: 'getUserList.controller' });
export default function getUserList(req, res) {
  const { page } = req.query;
  UserUtils.getUserCount((err, count) => {
    if (err) {
      log.fatal({ err }, 'error getting user list');
      return res.status(500).send(err);
    }

    const countPerPage = config.admin.userList.itemsPerPage;
    const start = ((page - 1) * countPerPage);

    UserUtils.getAllUsers(start, countPerPage, (err, users) => {
      if (err) {
        log.fatal({ err }, 'error getting user list');
        return res.status(500).send(err);
      }

      const sanitizedUsers = users.map(user => Object.assign({}, user, {
        auth: Object.assign({}, user.auth, { passhash: '' }),
      }));

      res.status(200).send({
        count,
        users: sanitizedUsers,
      });
    });
  });
};
