/**
 * Created by vivaldi on 07/11/16.
 */

/* global window */

import {
  syncUser,
  getSession,
  checkCanBroadcast,
  updateSessionId,
} from './UserAPI';
import { syncYoutubeMessages } from './YoutubeAPI';
import {
  getRoom,
  joinRoom,
  syncMessages,
  syncUsers,
  syncClientEvents,
  syncErrors,
} from './RoomAPI';
import { init } from './CamUtil';

import SocketUtil from './SocketUtil';
import { error } from './ErrorUtil';
import { getStoredRoom } from '../actions/RoomActions';

import * as chatActions from '../actions/ChatActions';
import * as camActions from '../actions/CamActions';
import * as sessionActions from '../actions/SessionActions';
import { setHandleModal } from '../actions/ModalActions';
import { addNotification, closeNotification } from '../actions/NotificationActions';
import * as roleActions from '../actions/RoleActions';
import SessionStore from '../stores/SessionStore';
import NotificationStore from '../stores/NotificationStore';
import ChatStore from '../stores/ChatStore/ChatStore';
import { ALERT_COLORS } from '../constants/AlertMap';
import {
  setBroadcastRestricted,
} from '../actions/UserActions';

const connectionFailureMessage = 'Unable to establish connection to chat server';

function clearConnectionNotifications() {
  const notifications = NotificationStore.getNotifications();
  for (let index = notifications.length - 1; index >= 0; index -= 1) {
    if ([connectionFailureMessage, 'Chat server disconnected'].includes(notifications[index].message)) {
      closeNotification(index);
    }
  }
}

function initJanus(janusId, roomName, userId) {
  init(janusId, roomName, userId, (camInitErr, initialized) => {
    if (camInitErr) {
      console.error(camInitErr, 'error from janus');
      if (camInitErr === 'ERR_DISCONNECT') {
        initJanus(janusId, roomName, userId);
      }
      return;
    }

    camActions.setCanBroadcast(initialized);
  });
}
export function connectToRoom(props) {
  syncUser();
  getRoom(props.room, (err, room) => {
    if (err) {
      addNotification({
        color: ALERT_COLORS.ERROR,
        message: 'Unable to connect to room',
      });
      return;
    }

    checkCanBroadcast(props.room, (err, canBroadcast) => {
      if (err) {
        addNotification({
          color: ALERT_COLORS.WARNING,
          message: 'Unable to broadcast',
        });
      }

      setBroadcastRestricted(!canBroadcast);
    });

    roleActions.fetchRoles(props.room);

    getStoredRoom(room);
    chatActions.setUserList(room.users);
    const { clientUser } = ChatStore.getState();
    let clientUserListId;
    if (clientUser) {
      console.log('got client user', clientUser._id);
      clientUserListId = clientUser._id;
    }

    joinRoom(room.name, props.user, clientUserListId, (joinErr, user) => {
      if (joinErr) {
        if (joinErr === 'ERR_USER_EXISTS') {
          console.warn('already joined the room');
          return;
        }

        console.error('error joining room', joinErr);
        addNotification({
          color: 'red',
          message: 'Error joining room',
          autoClose: false,
        });
        return;
      }

      console.log('rejoining room', user);

      chatActions.setClientUser(user);

      if (!clientUserListId) {
        console.log('reinitializing janus');
        initJanus(room.attrs.janus_id, room.name, user._id);
      }

      // open change handle modal to prompt
      // new user to change their handle
      setHandleModal(true);

      // start syncing messages
      syncMessages((msg) => {
        chatActions.addMessage(msg);
      });

      // sync room user list
      syncUsers();

      // sync client-specific events
      syncClientEvents();

      syncYoutubeMessages();
    });
  });
}

export function getRoomName() {
  const roomMatches = window.location.href.match(/((http|https):\/\/)?([\w\d.:]+)\/(\w+)/);
  const room = roomMatches[roomMatches.length - 1];
  return room;
}

function socketConnect(response, cb) {
  const room = getRoomName();

  sessionActions.setSessionId(SocketUtil.socket.id);
  SocketUtil.resume();
  clearConnectionNotifications();
  cb(null, {
    loading: false,
    room,
    user: response.user,
    activityToken: response.token,
  });
}

export function reconnect(cb = () => {}) {
  const {
    id: oldSocketId,
    isReconnecting,
  } = SessionStore.getState();

  if (isReconnecting) {
    return;
  }

  const newSocketId = SocketUtil.socket.id;
  if (!newSocketId) return;

  sessionActions.setIsReconnecting(true);
  return updateSessionId(oldSocketId, newSocketId, (err) => {
    sessionActions.setIsReconnecting(false);
    if (!err) sessionActions.setSessionId(newSocketId);

    // Another transport may have connected while this migration was in flight.
    // Chain from the last confirmed mapping instead of saving an unregistered ID.
    if (SocketUtil.socket.id !== newSocketId) {
      if (SocketUtil.socket.connected) return reconnect(cb);
      return;
    }

    if (err) {
      console.error(err);
      console.log('failed to update session ID');
      camActions.setCanBroadcast(false);

      error({
        context: 'chat',
        message: 'unable to reconnect to room, please refresh',
      });

      return cb('ERR_RECONNECT_FAIL');
    }

    camActions.setCanBroadcast(true);
    SocketUtil.resume();
    if (!SocketUtil.socket.connected || SocketUtil.socket.id !== newSocketId) return;
    clearConnectionNotifications();

    addNotification({
      color: 'blue',
      message: 'Chat server reconnected',
    });

    return cb();
  });
}

export function initRoom(cb) {
  let disconnectTimeout;
  let hasConnected = false;
  getSession((err, response) => {
    if (err) {
      return addNotification({
        color: 'red',
        message: 'Unable to get session',
        autoClose: false,
      });
    }

    SocketUtil.authSocket(response.token);

    // Socket.IO 4 emits connect for both initial and recovered namespace sessions.
    // Its Manager reconnect event can fire before the new socket ID is available.
    SocketUtil.listen('connect', () => {
      clearTimeout(disconnectTimeout);
      if (hasConnected) {
        return reconnect((reconnectError) => {
          if (reconnectError) cb(reconnectError);
        });
      }

      hasConnected = true;
      return socketConnect(response, cb);
    });

    SocketUtil.listen('disconnect', () => {
      console.log('socket disconnected');

      camActions.setCanBroadcast(false);
      addNotification({
        color: 'yellow',
        message: 'Chat server disconnected',
      });

      clearTimeout(disconnectTimeout);
      disconnectTimeout = setTimeout(() => {
        window.location.reload();
      }, 1000 * 60);
    });

    SocketUtil.listen('connect_error', (err) => {
      console.error(err);

      camActions.setCanBroadcast(false);
      addNotification({
        color: 'red',
        message: connectionFailureMessage,
        autoClose: false,
      });
    });

    syncErrors((err) => {
      error(err);
    });
  });
}

export default null;
