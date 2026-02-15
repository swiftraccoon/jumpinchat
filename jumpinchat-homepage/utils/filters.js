/**
 * Created by Zaccary on 19/03/2017.
 */

import { pick, omit } from 'lodash';

const filterRoomUser = function filterRoomUser(user) {
  return pick(user, [
    '_id',
    'handle',
    'operator_id',
    'user_id',
    'username',
    'isBroadcasting',
    'assignedBy',
  ]);
};

const filterClientUser = function filterClientUser(user) {
  return omit(user, [
    'signature',
    'socket_id',
    'session_id',
    'ip',
    'attrs',
    '__v',
    'auth',
  ]);
};

export function filterRoom(room) {
  const filteredRoomUsers = room.users.map(filterRoomUser);

  const filteredRoomAttrs = pick(room.attrs, ['owner', 'janus_id']);

  const filteredRoom = pick(room, ['_id', 'name', 'users', 'attrs', 'settings']);
  filteredRoom.users = filteredRoomUsers;
  filteredRoom.attrs = filteredRoomAttrs;

  return filteredRoom;
}

export { filterClientUser, filterRoomUser };
