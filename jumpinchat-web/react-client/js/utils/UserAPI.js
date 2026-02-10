/* global window */
import axios from 'axios';
import * as Sentry from '@sentry/browser';
import Fingerprint from '@fingerprintjs/fingerprintjs';
import { trackEvent } from './AnalyticsUtil';
import SocketUtil from './SocketUtil';
import {
  logUserIn,
  setUserInfo,
  setHandleError,
  changeHandle as changeHandleAction,
  setUnreadMessages,
  setBroadcastQuality,
} from '../actions/UserActions';

import { setQualityOptions } from '../actions/CamActions';

import { setHandleModal } from '../actions/ModalActions';
import {
  setProfile,
  setLoading as setProfileLoading,
} from '../actions/ProfileActions';
import { addNotification } from '../actions/NotificationActions';
import { ALERT_COLORS } from '../constants/AlertMap';


const events = {
  CHANGE_HANDLE: 'room::handleChange',
  CLIENT_HANDLE: 'client::handleChange',
  USER_DATA: 'self::user',
};

function getFingerprint() {
  return new Promise(async (resolve, reject) => {
    try {
      const fp = await Fingerprint.load();
      const result = await fp.get();
      return resolve(result.visitorId);
    } catch (err) {
      return reject(err);
    }
  });
}

export function checkCanBroadcast(room, cb) {
  const url = `/api/user/checkCanBroadcast${room ? `/${room}` : ''}`;
  return axios.get(url)
    .then((response) => {
      if (response.data && response.data.videoOptions) {
        setQualityOptions(response.data.videoOptions);
      }

      return cb(null, true);
    })
    .catch((err) => {
      if (err.response) {
        if (err.response.status === 403) {
          if (err.response.data === 'ERR_BROADCAST_BAN') {
            addNotification({
              color: ALERT_COLORS.WARNING,
              message: 'You are banned from broadcasting',
              autoClose: false,
            });
          }

          if (err.response.data === 'ERR_AGE_RESTRICTED') {
            addNotification({
              color: ALERT_COLORS.INFO,
              message: 'You need to be age verified to broadcast',
              action: {
                type: 'link',
                payload: '/ageverify',
              },
              autoClose: false,
            });
          }

          return cb(null, false);
        }

        addNotification({
          color: ALERT_COLORS.WARNING,
          message: 'Unable to broadcast',
        });
        return cb(true);
      }

      addNotification({
        color: ALERT_COLORS.WARNING,
        message: 'Unable to broadcast',
      });

      return cb(err);
    });
}

export async function getSession(cb) {
  let fp;
  try {
    fp = await getFingerprint();
  } catch (err) {
    console.error(err);
  }

  try {
    axios.post('/api/user/session', { fp })
      .then((response) => {
        if (response.data.user) {
          const { user } = response.data;
          logUserIn(user);
          Sentry.setUser({ id: user.user_id });
        }

        return cb(null, response.data);
      })
      .catch((err) => {
        console.error(err);
        return cb(err);
      });
  } catch (err) {
    return cb(err);
  }
}

export function updateSessionId(oldId, newId, cb) {
  if (!oldId) {
    return cb('no existing socket');
  }

  const prefixedOldId = `${oldId}`;
  const prefixedNewId = `${newId}`;
  let retryCount = 5;

  const updateReq = () => axios
    .put(`/api/user/socket/old/${encodeURIComponent(prefixedOldId)}/new/${encodeURIComponent(prefixedNewId)}`)
    .then(() => {
      return cb(null);
    })
    .catch((err) => {
      console.warn('reconnect attempts left ', retryCount);
      if (retryCount > 0) {
        console.warn('reconnect failed, retrying');
        setTimeout(updateReq, 2000);
        retryCount -= 1;
        return false;
      }

      console.error(err);
      return cb('ERR_NO_SESSION');
    });

  return updateReq();
}

export function syncUser() {
  SocketUtil.listen(events.USER_DATA, (msg) => {
    setUserInfo(msg.user);
  });

  SocketUtil.listen(events.CLIENT_HANDLE, (msg) => {
    changeHandleAction(msg);
    setHandleModal(false);
  });
}

export function changeHandle(newHandle) {
  trackEvent('Chat', 'Change user handle');

  SocketUtil.emit(events.CHANGE_HANDLE, { handle: newHandle });

  SocketUtil.listen('client::error', (msg) => {
    if (msg.context === 'handle-change') {
      setHandleModal(true);
      setHandleError(msg.error);
    }
  });
}

export function setVerifyReminded() {
  axios.post('/api/user/hasremindedverify')
    .catch((err) => {
      console.error(err);
    });
}

export function setNotificationsEnabled(userId, enabled) {
  if (!userId) {
    return false;
  }

  return axios.put(`/api/user/${userId}/setnotifications`, { enabled })
    .catch((err) => {
      console.error(err);
    });
}

export function setThemeRequest(userId, darkTheme) {
  axios.put(`/api/user/${userId}/theme?dark=${darkTheme}`)
    .catch((err) => {
      console.error(err);
    });
}

export function getUserProfile(userId) {
  return axios.get(`/api/user/${userId}/profile`)
    .then((response) => {
      setProfileLoading(false);
      return setProfile(response.data, false);
    })
    .catch(() => {
      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: 'Error fetching user profile',
      });
    });
}

export function getUnreadMessages(userId) {
  return axios.get(`/api/message/${userId}/unread`)
    .then((response) => {
      return setUnreadMessages(response.data.unread);
    })
    .catch(() => {
      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: 'Error fetching unread messages',
      });
    });
}

export function saveBroadcastQuality(quality) {
  return axios.put(`/api/user/setBroadcastQuality?quality=${quality}`)
    .then((response) => {
      return setBroadcastQuality(response.data);
    })
    .catch(() => {
      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: 'Error saving quality settings',
      });
    });
}
