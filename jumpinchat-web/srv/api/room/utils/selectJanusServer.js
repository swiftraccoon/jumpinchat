import logFactory from '../../../utils/logger.util.js';
import config from '../../../config/env/index.js';
import getAvgUsersInRoom from './getAvgUsersInRoom.js';
const log = logFactory({ name: 'selectJanusServer' });
/*
  S = sessions on server
  r = rooms
  u = avg users per room

  Est total number of active peer connections (lower = less load)
  (S * u) - S
*/
export default async function selectJanusServer() {
  const janusServers = config.janus.serverIds;

  let userAverages;
  try {
    const promises = janusServers.map(s => getAvgUsersInRoom(s));
    userAverages = await Promise.all(promises);
  } catch (err) {
    throw err;
  }

  const minLoadIndex = userAverages
    .map(({ average, total }) => (average * (total ** 2)) - total)
    .reduce((minIndex, val, i, arr) => {
      if (val < arr[minIndex]) {
        return i;
      }

      return minIndex;
    }, 0);

  return janusServers[minLoadIndex];
};
