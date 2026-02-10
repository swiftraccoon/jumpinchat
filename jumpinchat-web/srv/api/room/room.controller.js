/**
 * Created by vivaldi on 08/11/2014.
 */


import roomCreate from './controllers/room.create.js';
import roomRemove from './controllers/room.remove.js';
import changeHandle from './controllers/room.changeHandle.js';
import getRoom from './controllers/room.getRoom.js';
import changeColor from './controllers/room.changeChatColor.js';
import leaveRoom from './controllers/room.leaveRoom.js';
import sanitizeRoom from './controllers/room.sanitize.js';
import banUser from './controllers/moderation/room.moderation.banUser.js';
import unbanUser from './controllers/moderation/room.moderation.unbanUser.js';
import fetchBanlist from './controllers/room.fetchBanlist.js';
import getRoomList from './controllers/room.getRoomList.js';
let _io;

export function setSocketIo(io) {
  _io = io;
};

export function getSocketIo() {
  return _io;
};

export { changeHandle };
export const createRoom = roomCreate;
export const removeRoom = roomRemove;
export { getRoom };
export { changeColor };
export { leaveRoom };
export const sanitizeUserList = sanitizeRoom;
export { banUser };
export { unbanUser };
export { fetchBanlist };
export { getRoomList };

export default { setSocketIo, getSocketIo, changeHandle, createRoom, removeRoom, getRoom, changeColor, leaveRoom, sanitizeUserList, banUser, unbanUser, fetchBanlist, getRoomList };
