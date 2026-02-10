
import { NotFoundError } from '../../../utils/error.util.js';
import { getUserByName } from '../user.utils.js';
export default async function getUserByNameController({ username }) {
  let user;

  try {
    user = await getUserByName(username);
  } catch (err) {
    throw err;
  }

  if (!user) {
    throw new NotFoundError('No user found');
  }

  return {
    userId: user._id,
    username,
  };
};
