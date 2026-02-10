
import { NotFoundError } from '../../../utils/error.util.js';
import mfaRequestEnroll from '../controllers/mfaRequestEnroll.controller.js';
export default async function mfaRequestEnrollConnector(req, res) {
  const {
    user,
  } = req;

  try {
    const response = await mfaRequestEnroll({ userId: user._id });
    return res.status(200).send(response);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(403).send(err.message);
    }

    return res.status(500).send();
  }
};
