
import { NotFoundError } from '../../../utils/error.util.js';
import errors from '../../../config/constants/errors.js';
import getUserByName from '../controllers/user.getUserByName.js';
export default async function getUserByNameConnector(req, res) {
  const { username } = req.params;

  try {
    const user = await getUserByName({ username });
    return res.status(200).send(user);
  } catch (err) {
    if (err.name === NotFoundError.name) {
      return res.status(404).send(err.message);
    }

    return res.status(500).send(errors.ERR_SRV.message);
  }
};
