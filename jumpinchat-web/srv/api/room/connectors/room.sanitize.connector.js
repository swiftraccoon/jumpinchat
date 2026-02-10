
import roomSanitize from '../controllers/room.sanitize.js';
export default function roomSanitizeConnector(req, res) {
  const { roomName } = req.params;

  return roomSanitize(roomName, (err) => {
    if (err) {
      return res.status(500).send(err);
    }

    return res.status(204).send();
  });
};
