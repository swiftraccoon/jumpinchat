
import express from 'express';
import { verifyAdmin } from '../../utils/utils.js';
import trophyModel from './trophy.model.js';
import migrate from './controllers/migrate.controller.js';
import migrateUsers from './controllers/migrateUserTrophies.controller.js';
import getByName from './controllers/getById.controller.js';
import applyTrophy from './controllers/applyTrophy.controller.js';
const router = express.Router();

router.get('/:name', getByName);
router.get('/', (req, res) => {
  trophyModel.find().exec()
    .then((trophies) => res.status(200).send(trophies))
    .catch(() => res.status(500).send('ERR_SRV'));
});
router.put('/apply/:userId', verifyAdmin, applyTrophy);
router.post('/migrate', migrate);
router.post('/migrateUsers', migrateUsers);

export default router;
