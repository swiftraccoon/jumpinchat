
import logFactory from '../../utils/logger.util.js';
import userModel from '../../api/user/user.model.js';
import roomModel from '../../api/room/room.model.js';
const log = logFactory({ name: 'migrations.missingRooms' });
export default async function missingRoomsMigrate() {
  log.info('initiate missing room migrations');
  const cursor = userModel.find({}).cursor();
  const handleCheckRoom = async (user) => {
    log.debug({ username: user.username });
    if (!user) {
      log.debug('no user');
      return Promise.resolve({});
    }

    let room;

    try {
      room = await roomModel.findOne({ name: user.username }).exec();
    } catch (err) {
      log.fatal({ err }, 'failed to fetch room');
      throw err;
    }

    if (!room) {
      log.debug({ username: user.username }, 'room missing, creating fresh one');
      const roomSettings = {
        public: false,
        moderators: [
          {
            user_id: user._id,
            username: user.username,
            session_token: user.session_id,
            permissions: {
              mute_room_chat: true,
              mute_room_audio: true,
              apply_password: true,
              assign_operator: true,
            },
          },
        ],
      };

      const roomDoc = {
        name: user.username,
        attrs: {
          creation_ip: user.attrs.join_ip,
          owner: user._id,
        },
        settings: roomSettings,
      };

      return roomModel.create(roomDoc);
    }

    log.debug({ username: user.username }, 'room exists');

    return Promise.resolve({});
  };

  for await (const doc of cursor) {
    await handleCheckRoom(doc);
  }

  log.info('migration complete');
};
