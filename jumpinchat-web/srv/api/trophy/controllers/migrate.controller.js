const log = require('../../../utils/logger.util')({ name: 'migrate trophies' });
const trophyModel = require('../trophy.model');
const trophyConst = require('../trophies');

module.exports = function migrate(req, res) {
  log.debug('migrate trophies');
  return trophyModel.find({}).exec()
    .then((trophies) => {
      const promises = trophyConst.trophies.map((trophy) => {
        const existingTrophy = trophies.find(t => t.name === trophy.name);
        if (existingTrophy) {
          Object.assign(existingTrophy, trophy);
          return existingTrophy.save()
            .then(() => log.debug('saved existing trophy'))
            .catch((saveErr) => log.fatal({ err: saveErr }, 'error saving trophy'));
        }

        return trophyModel.create(trophy)
          .then(() => log.debug('created new trophy document'))
          .catch((createErr) => log.fatal({ err: createErr }, 'error creating trophy'));
      });

      return Promise.all(promises).then(() => res.status(200).send());
    })
    .catch((err) => {
      log.fatal({ err }, 'error fetching trophies');
      res.status(500).send();
    });
};
