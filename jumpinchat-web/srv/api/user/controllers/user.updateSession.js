import jwt from 'jsonwebtoken';
import config from '../../../config/env/index.js';
import logFactory from '../../../utils/logger.util.js';
import RoomUtils from '../../room/room.utils.js';
import RoomModel from '../../room/room.model.js';
import UserSocket from '../user.socket.js';
import redisUtils from '../../../utils/redis.util.js';

const log = logFactory({ name: 'updateSession' });
const SESSION_TTL_SECONDS = 60 * 60 * 24;

export default async function updateSession(req, res) {
  const { oldId, newId } = req.params;
  try {
    if (!req.sessionID || !oldId || !newId) return res.status(403).send();
    const io = UserSocket.getIo();
    if (!io) return res.status(503).send();
    const sockets = await io.in(newId).fetchSockets();
    const replacement = sockets.find(socket => socket.id === newId);
    if (!replacement) return res.status(403).send();
    const token = jwt.verify(replacement.handshake.auth.token, config.auth.jwt_secret);
    if (token.session !== req.sessionID) return res.status(403).send();

    // A response can be lost after migration. Accept its existing new hash/member
    // on retry, but never recreate a removed member or bypass normal join checks.
    const oldData = await RoomUtils.getSocketCacheInfo(oldId);
    const data = oldData || await RoomUtils.getSocketCacheInfo(newId);
    if (!data?.name || !data.userListId) return res.status(403).send();
    const room = await RoomUtils.getRoomByName(data.name);
    const member = room?.users.find(user => String(user._id) === data.userListId
      && user.session_id === req.sessionID && [oldId, newId].includes(user.socket_id));
    if (!member) return res.status(403).send();

    const newData = { ...data, disconnected: 'false' };
    delete newData.reconnectUntil;
    await redisUtils.callPromise('hmset', newId, newData);
    await redisUtils.callPromise('hDel', newId, 'reconnectUntil');
    await redisUtils.callPromise('expire', newId, SESSION_TTL_SECONDS);

    if (member.socket_id !== newId) {
      const changed = await RoomModel.updateOne({
        _id: room._id,
        users: { $elemMatch: { _id: member._id, socket_id: oldId, session_id: req.sessionID } },
      }, { $set: { 'users.$.socket_id': newId } });
      if (!changed.matchedCount) return res.status(403).send();
    }
    replacement.join(data.name);
    // Adapter broadcasts and its subsequent membership query are ordered.
    const joined = await io.in(data.name).fetchSockets();
    if (!joined.some(socket => socket.id === newId)) return res.status(503).send();
    await redisUtils.callPromise('set', data.userListId, newId, { EX: 60 * 60 });
    if (oldId !== newId) await redisUtils.callPromise('del', oldId);
    log.info({ oldId, newId, room: data.name }, 'reconnected socket to room');
    return res.status(200).send();
  } catch (err) {
    log.error({ err, oldId, newId }, 'failed to recover room connection');
    return res.status(403).send();
  }
}
