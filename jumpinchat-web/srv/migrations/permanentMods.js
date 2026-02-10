
import roomModel from '../api/room/room.model.js';
import logFactory from '../utils/logger.util.js';
const log = logFactory({ name: 'migrate permanent mods' });
function applyModPermissions(owner, moderators) {
  return moderators.map((mod) => {
    if (mod.assignedBy && String(mod.assignedBy) === owner) {
      return {
        ...mod,
        permissions: {
          ...mod.permissions,
          assign_operator: true,
        },
      };
    }

    return mod;
  });
}

export default async function migratePermanentMods() {
  try {
    const rooms = await roomModel
      .find({
        'attrs.owner': {
          $ne: null,
        },
      })
      .exec();

    rooms.forEach(async (room) => {
      const owner = String(room.attrs.owner);
      const { moderators } = room.settings;
      room.settings.moderators = applyModPermissions(owner, moderators.toObject());
      try {
        await room.save();
        log.info({ room: room.name }, 'room saved');
      } catch (err) {
        log.fatal({ err }, 'failed to save room');
      }
    });
  } catch (err) {
    log.fatal({ err }, 'failed to get room list');
  }
};
