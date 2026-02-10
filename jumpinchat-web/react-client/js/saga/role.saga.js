import axios from 'axios';
import { RoleDispatcher } from '../dispatcher/AppDispatcher';
import roleStore from '../stores/RoleStore';
import roomStore from '../stores/RoomStore';
import * as roleActions from '../actions/RoleActions';
import { addNotification } from '../actions/NotificationActions';
import * as types from '../constants/ActionTypes';
import { ALERT_COLORS } from '../constants/AlertMap';

function handleRequestError(err) {
  if (err.response) {
    if (typeof err.response.data === 'string' && err.response.data) {
      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.response.data,
      });
    }

    if (err.response.data) {
      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.response.data,
      });
    }
  }

  return addNotification({
    color: ALERT_COLORS.ERROR,
    message: 'Request error',
  });
}

function fetchRoles(action) {
  const roomName = action.roomName || roomStore.getRoom().name;
  axios.get(`/api/role/room/${roomName}/all`)
    .then((response) => {
      return roleActions.setRoles(response.data);
    })
    .catch((err) => {
      if (err.response && err.response.data) {
        return addNotification({
          color: ALERT_COLORS.ERROR,
          message: err.response.data,
        });
      }

      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.message,
      });
    });
}

function saveRoles({ roles }) {
  const roomName = roomStore.getRoom().name;
  // remove temp IDs from new roles
  const filteredRoles = roles.map((role) => {
    if (role.new) {
      return {
        ...role,
        _id: undefined,
      };
    }

    return role;
  });

  axios.put(`/api/role/room/${roomName}`, { roles: filteredRoles })
    .then((response) => {
      addNotification({
        color: ALERT_COLORS.SUCCESS,
        message: 'Roles updated',
      });
      return roleActions.setRoles(response.data);
    })
    .catch((err) => {
      if (err.response) {
        return handleRequestError(err);
      }

      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.message,
      });
    });
}

function removeRole({ roleId }) {
  const { roles } = roleStore.getState();
  const roomName = roomStore.getRoom().name;
  const role = roles.find(r => r._id === roleId);

  if (role && (role.new || role.permanent)) {
    return false;
  }

  return axios.delete(`/api/role/room/${roomName}/role/${roleId}`)
    .then(() => {
      return addNotification({
        color: ALERT_COLORS.SUCCESS,
        message: 'Roles updated',
      });
    })
    .catch((err) => {
      if (err.response && err.response.data) {
        return addNotification({
          color: ALERT_COLORS.ERROR,
          message: err.response.data,
        });
      }

      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.message,
      });
    });
}

function getEnrollmentList() {
  const roomName = roomStore.getRoom().name;

  return axios.get(`/api/role/room/${roomName}/enrollments`)
    .then((response) => {
      return roleActions.setRoomEnrollments(response.data);
    })
    .catch((err) => {
      if (err.response && err.response.data) {
        return addNotification({
          color: ALERT_COLORS.ERROR,
          message: err.response.data,
        });
      }

      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.message,
      });
    });
}

function addUser({ username }) {
  const { enrollments } = roleStore.getState();

  roleActions.addRoomUserEnrollmentFailed(null);

  if (!username) {
    return false;
  }

  return axios.get(`/api/user/${username}`)
    .then((response) => {
      const hasUser = enrollments.some(e => e.userId === response.data.userId);

      if (!hasUser) {
        return roleActions.setRoomEnrollments([
          {
            ...response.data,
            roles: [],
            new: true,
          },
          ...enrollments,
        ]);
      }

      return addNotification({
        color: ALERT_COLORS.WARNING,
        message: 'User added already',
      });
    })
    .catch((err) => {
      if (err.response) {
        roleActions.addRoomUserEnrollmentFailed(err.response.data || err.message);
        return addNotification({
          color: ALERT_COLORS.ERROR,
          message: err.response.data,
        });
      }

      roleActions.addRoomUserEnrollmentFailed(err.message);
    });
}

function enrollUser({ roleId, userId }) {
  console.log('enrollUser', { roleId, userId });
  const roomName = roomStore.getRoom().name;
  return axios.post('/api/role/enroll', { roleId, userId, roomName })
    .then(() => {
      return getEnrollmentList();
    })
    .catch((err) => {
      if (err.response && err.response.data) {
        return addNotification({
          color: ALERT_COLORS.ERROR,
          message: err.response.data,
        });
      }

      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.message,
      });
    });
}

function unenrollUser({ enrollmentId }) {
  const roomName = roomStore.getRoom().name;
  return axios.delete(`/api/role/room/${roomName}/enrollment/${enrollmentId}`)
    .then(() => {
      return getEnrollmentList();
    })
    .catch((err) => {
      if (err.response && err.response.data) {
        return addNotification({
          color: ALERT_COLORS.ERROR,
          message: err.response.data,
        });
      }

      return addNotification({
        color: ALERT_COLORS.ERROR,
        message: err.message,
      });
    });
}

export default function RoleSaga() {
  RoleDispatcher.register(({ action }) => {
    const { actionType } = action;

    switch (actionType) {
      case types.ROLES_FETCH:
        fetchRoles(action);
        break;
      case types.ROLES_SAVE:
        saveRoles(action);
        break;
      case types.ROLES_REMOVE:
        removeRole(action);
        break;

      case types.ENROLLMENTS_FETCH:
        getEnrollmentList(action);
        break;
      case types.ENROLLMENT_USER_ADD:
        addUser(action);
        break;
      case types.ENROLL_USER:
        enrollUser(action);
        break;
      case types.UNENROLL_USER:
        unenrollUser(action);
        break;
      default:
        break;
    }
  });
}
