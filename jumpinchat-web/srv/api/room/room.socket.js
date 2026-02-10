/**
 * Created by vivaldi on 08/11/2014.
 */



import changeHandleSocket from './sockets/changeHandle.socket.js';
import handleMessageSocket from './sockets/handleMessage.socket.js';
import handleJoinRoomSocket from './sockets/handleJoinRoom.socket.js';
import handleDisconnectSocket from './sockets/handleDisconnect.socket.js';
import handleBanUserSocket from './sockets/handleBanUser.socket.js';
import handleuUnbanUserSocket from './sockets/handleUnbanUser.socket.js';
import fetchBanlistSocket from './sockets/fetchBanlist.socket.js';
import runCommandSocket from './sockets/runCommand.socket.js';
import setUserIsBroadcastingSocket from './sockets/setUserIsBroadcasting.socket.js';
import changeColorSocket from './sockets/changeColor.socket.js';
import handleCloseBroadcast from './sockets/handleCloseBroadcast.socket.js';
import privateMessageSocket from './sockets/privateMessage.socket.js';
import isStillJoinedSocket from './sockets/isStillJoined.socket.js';
import ignoreUserSocket from './sockets/ignoreUser.socket.js';
import unignoreUserSocket from './sockets/unignoreUser.socket.js';
import updateIgnoreListSocket from './sockets/updateIgnoreList.socket.js';
import handleSilenceUserSocket from './sockets/handleSilenceUser.socket.js';
import handleKickUserSocket from './sockets/handleKickUser.socket.js';
import setTopicSocket from './sockets/setTopic.socket.js';
import getRoomUsersSocket from './sockets/getRoomUsers.socket.js';
export function register(socket, io) {
  const changeHandle = changeHandleSocket(socket, io);
  const handleMessage = handleMessageSocket(socket, io);
  const handleJoinRoom = handleJoinRoomSocket(socket, io);
  const handleDisconnect = handleDisconnectSocket(socket, io);
  const handleBanUser = handleBanUserSocket(socket, io);
  const handleUnbanUser = handleuUnbanUserSocket(socket, io);
  const fetchBanlist = fetchBanlistSocket(socket, io);
  const runCommand = runCommandSocket(socket, io);
  const setUserIsBroadcasting = setUserIsBroadcastingSocket(socket, io);
  const changeColor = changeColorSocket(socket, io);
  const closeBroadcast = handleCloseBroadcast(socket, io);
  const privateMessage = privateMessageSocket(socket, io);
  const isStillJoined = isStillJoinedSocket(socket, io);
  const ignoreUser = ignoreUserSocket(socket, io);
  const unignoreUser = unignoreUserSocket(socket, io);
  const updateIgnoreList = updateIgnoreListSocket(socket, io);
  const handleSilenceUser = handleSilenceUserSocket(socket, io);
  const handleKickUser = handleKickUserSocket(socket, io);
  const setTopic = setTopicSocket(socket, io);
  const getRoomUsers = getRoomUsersSocket(socket, io);

  socket.on('room::operation::ban', handleBanUser);
  socket.on('room::operation::unban', handleUnbanUser);
  socket.on('room::operation::banlist', fetchBanlist);
  socket.on('room::operation::silence', handleSilenceUser);
  socket.on('room::operation::kick', handleKickUser);
  socket.on('room::handleChange', changeHandle);

  /**
   * message:
   * event: the event that was called on the client
   * timestamp: the time the event was called on the client (for performance monitoring maybe)
   * payload: the actual data that is being sent, if applicable
   * browser-sig: the browser signature calling the event
   *
   */
  socket.on('room::join', handleJoinRoom);

  socket.on('disconnect', handleDisconnect);

  socket.on('room::message', handleMessage);
  socket.on('room::command', runCommand);
  socket.on('room::setUserIsBroadcasting', setUserIsBroadcasting);
  socket.on('room::changeColor', changeColor);
  socket.on('room::operation::closeBroadcast', closeBroadcast);
  socket.on('room::privateMessage', privateMessage);
  socket.on('room::isStillJoined', isStillJoined);
  socket.on('room::ignoreUser', ignoreUser);
  socket.on('room::unignoreUser', unignoreUser);
  socket.on('room::getIgnoreList', updateIgnoreList);
  socket.on('room::setTopic', setTopic);
  socket.on('room::users', getRoomUsers);
};

export default { register };
