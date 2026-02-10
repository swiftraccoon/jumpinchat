


import express from 'express';
import utils from '../../utils/utils.js';
import createRole from './connectors/createRole.connector.js';
import getRoomRoles from './connectors/getRoomRoles.connector.js';
import getRoomRole from './connectors/getRoomRole.connector.js';
import getUserRoles from './connectors/getUserRoles.connector.js';
import addUserToRole from './connectors/addUserToRole.connector.js';
import updateRoomRole from './connectors/updateRoomRole.connector.js';
import removeRoomRole from './connectors/removeRoomRole.connector.js';
import getRoomUserRoleList from './connectors/getRoomUserRoleList.connector.js';
import removeUserFromRole from './connectors/removeUserFromRole.connector.js';
import getUserHasPermissions from './connectors/getUserHasPermissions.connector.js';
import migrateDefaultRoles from '../../migrations/roles/defaultRoles.js';
const router = express.Router();

router.get('/room/:roomName', utils.validateSession, getRoomRole);
router.get('/room/:roomName/all', utils.validateSession, getRoomRoles);
router.put('/room/:roomName', utils.validateAccount, updateRoomRole);
router.get('/id/:roleId', utils.validateSession, getRoomRole);
router.get('/:roleId', utils.validateSession, getRoomRole);
router.get('/room/:roomName/enrollments', utils.validateAccount, getRoomUserRoleList);
router.delete('/room/:roomName/role/:roleId', utils.validateAccount, removeRoomRole);
router.get('/user/:roomName/:userListId', utils.validateSession, getUserRoles);
router.post('/', utils.validateAccount, createRole);
router.post('/enroll', utils.validateAccount, addUserToRole);
router.delete('/room/:roomName/enrollment/:enrollmentId', utils.validateAccount, removeUserFromRole);
router.get('/permission/:userId/room/:roomName', getUserHasPermissions);

router.post('/migrate/defaultRoles', (req, res) => {
  migrateDefaultRoles();
  return res.status(200).send();
});

export default router;
