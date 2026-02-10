
import userModel from '../../api/user/user.model.js';
import logFactory from '../../utils/logger.util.js';
import data from './data.json' with { type: 'json' };
const log = logFactory({ name: 'migrateUserDocuments' });
export default async function trophiesFix() {
  const promiseArray = [];
  data.forEach((d) => {
    const p = userModel.updateMany({ _id: d.userId }, { $set: { trophies: d.trophies } }).exec();
    promiseArray.push(p);
  });

  try {
    await Promise.all(promiseArray);
    log.info('trophies migrated');
  } catch (err) {
    log.fatal({ err }, 'failed to migrate trophies');
  }
};
