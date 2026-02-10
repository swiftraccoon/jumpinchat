
import logFactory from '../../utils/logger.util.js';
import roomModel from '../../api/room/room.model.js';
import roleModel from '../../api/role/role.model.js';
import enrolledModel from '../../api/role/enrolled.model.js';
import { getAllRoomRoles, createDefaultRoles } from '../../api/role/role.utils.js';
import createRole from '../../api/role/controllers/createRole.controller.js';
const log = logFactory({ name: 'migrations.defaultRoles' });
export default async function defaultRoleMigrate() {
  log.info('initiate default roles migration');
  const cursor = roomModel.find({ 'attrs.owner': { $ne: null } }).cursor();
  const handleAddRoles = async (room) => {
    if (!room) {
      log.warn('no room, skipping');
      return Promise.resolve({});
    }

    try {
      const permanentRoles = await roleModel.find({ roomId: room._id, permanent: true }).exec();
      const permEnrolmentQuery = await enrolledModel.deleteMany({
        $or: [
          ...permanentRoles.map(r => ({ role: r._id })),
        ],
      }).exec();

      const permRoleQuery = await roleModel
        .deleteMany({ roomId: room._id, permanent: true })
        .exec();

      log.debug({ permEnrolmentQuery, permRoleQuery }, 'removed permanent role enrollments');
    } catch (err) {
      log.fatal({ err }, 'failed to clear existing permanent roles');
      throw err;
    }


    const defaultRoles = createDefaultRoles(room.name);
    log.debug({ defaultRoles });
    const roleTags = Object.values(defaultRoles).map(role => ({ ...role }));
    let roles;

    try {
      roles = await getAllRoomRoles(room._id);
    } catch (err) {
      log.fatal({ err }, 'failed to fetch roles');
      throw err;
    }

    const rolePromises = roleTags
      .map((role) => {
        const existingRole = roles.find(r => r.tag === role.tag);
        if (!existingRole) {
          return createRole({ roomName: room.name, ...role });
        }

        return null;
      })
      .filter(r => r !== null);

    let createdRoles;
    try {
      createdRoles = await Promise.all(rolePromises);
    } catch (err) {
      log.fatal({ err }, 'failed to create roles');
      throw err;
    }

    if (createdRoles.length === 0) {
      return Promise.resolve({});
    }

    // add existing moderators to enrollments
    const modRole = createdRoles.find(r => r.tag === defaultRoles.modRole.tag);
    room.settings.moderators
      .map((mod) => {
        // only migrate permanent mods
        const isPerm = mod.assignedBy === null
          || String(mod.assignedBy) === String(room.attrs.owner);

        if (isPerm) {
          return enrolledModel.create({
            role: modRole._id,
            user: mod.user_id,
            room: room._id,
            enrolledBy: mod.assignedBy || room.attrs.owner,
          });
        }

        return null;
      })
      .filter(p => p !== null);

    return Promise.resolve({});
  };

  for await (const doc of cursor) {
    try {
      await handleAddRoles(doc);
    } catch (err) {
      log.error({ err }, 'failed to add roles');
    }
  }

  log.info('migration complete');
};
