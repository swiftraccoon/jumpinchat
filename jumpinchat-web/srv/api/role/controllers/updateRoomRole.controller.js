
/**
 * updateRoleController
 *
 * @param {object} body
 * @param {string} body.roomName - name of room
 * @param {string} body.roleId - ID of role
 * @param {object} body.updatedRoles - new role data
 * @param {object} body.userId - user making the request
 *
 * @return {...}
 */
import logFactory from '../../../utils/logger.util.js';
import roleUtils from '../role.utils.js';
import roleModel from '../role.model.js';
import createRole from './createRole.controller.js';
import { getRoomByName } from '../../room/room.utils.js';
import { ValidationError } from '../../../utils/error.util.js';
const log = logFactory({ name: 'updateRoleController.controller' });
export default async function updateRolesController(body) {
  const {
    roomName,
    roles: updatedRoles,
    userId,
  } = body;

  if (!updatedRoles) {
    throw new ValidationError('roles missing');
  }

  const rolesErr = updatedRoles.reduce((acc, role) => {
    const { name, tag } = role;

    if (!name || name.trim().length === 0) {
      return new ValidationError('Role name can not be empty');
    }

    if (name.length > 64) {
      return new ValidationError('Role name can not be longer than 64 characters');
    }


    if (!tag || tag.trim().length < 2) {
      return new ValidationError('Tag is required');
    }

    if (tag && tag.length > 32) {
      return new ValidationError('Tag can not be longer than 32 characters');
    }

    if (!roleUtils.validateTag(tag)) {
      return new ValidationError('Tag can only contain letters, numbers and underscores');
    }

    return null;
  }, null);

  if (rolesErr) {
    throw rolesErr;
  }

  // TODO: check user has permissions to update role

  let room;

  try {
    room = await getRoomByName(roomName);
  } catch (err) {
    log.fatal({ err, roomName }, 'failed to get room');
    throw err;
  }

  if (!room) {
    throw new Error(`Room "${roomName}" could not be found`);
  }

  try {
    await roleUtils.getUserHasRolePermissions(roomName, { userId }, 'manageRoles');
  } catch (err) {
    throw err;
  }

  let roles;
  try {
    roles = await roleUtils.getAllRoomRoles(room._id);
  } catch (err) {
    log.fatal({ err }, 'failed to get roles');
    throw err;
  }

  let rolePromises = [];

  const newRoles = updatedRoles.filter(role => !roles.find(r => String(r._id) === role._id));
  const changedRoles = updatedRoles.filter(role => roles.find(r => String(r._id) === role._id));

  rolePromises = [
    ...newRoles.map(r => createRole({
      ...r,
      roomName,
    })),
    ...changedRoles.map(role => roleModel.updateOne(
      { _id: role._id }, {
        $set: {
          name: role.name,
          tag: role.tag,
          order: role.order,
          icon: {
            ...role.icon,
          },
          permissions: {
            ...role.permissions,
          },
        },
      },
    )),
  ];

  try {
    await Promise.all(rolePromises);
  } catch (err) {
    log.fatal({ err }, 'failed to update room roles');
    throw err;
  }

  const io = roleUtils.getSocketIo();
  io.to(roomName).emit('roles::update');

  return roleUtils.getAllRoomRoles(room._id);
};
