import redisUtils from './redis.util.js';

export const RECONNECT_GRACE_MS = 60_000;

export function hasReconnectDeadline(data, now = Date.now()) {
  return Number(data?.reconnectUntil) > now;
}

export async function markSocketRecoverable(socketId) {
  // Do not recreate an old hash if another worker has already migrated it.
  return redisUtils.callPromise('eval', `
    if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
    redis.call('HSET', KEYS[1], 'reconnectUntil', ARGV[1], 'disconnected', 'true')
    return 1
  `, { keys: [socketId], arguments: [String(Date.now() + RECONNECT_GRACE_MS)] });
}

export async function retainConnectedUsers(users, connectedIds) {
  const connected = new Set(connectedIds);
  const retained = await Promise.all(users.map(async (user) => {
    if (!user.socket_id) return false;
    if (connected.has(user.socket_id)) return true;
    const data = await redisUtils.callPromise('hgetall', user.socket_id);
    return hasReconnectDeadline(data);
  }));
  return users.filter((user, index) => retained[index]);
}
