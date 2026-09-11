import express from 'express';
import request from 'supertest';
import sinon from 'sinon';
import esmock from 'esmock';

describe('role HTTP routes', () => {
  let app;
  let controller;
  let migration;
  let validateAccount;

  before(async () => {
    controller = sinon.spy((_req, res) => res.sendStatus(204));
    migration = sinon.spy();
    validateAccount = sinon.spy((_req, _res, next) => next());
    const connectorNames = [
      'createRole', 'getRoomRoles', 'getRoomRole', 'getUserRoles', 'addUserToRole',
      'updateRoomRole', 'removeRoomRole', 'getRoomUserRoleList', 'removeUserFromRole',
      'getUserHasPermissions',
    ];
    const router = await esmock.strict('./index.js', {
      ...Object.fromEntries(connectorNames.map(name => [`./connectors/${name}.connector.js`, { default: controller }])),
      '../../utils/utils.js': { default: {
        validateAccount, validateSession: (_req, _res, next) => next(),
      } },
      '../../migrations/roles/defaultRoles.js': { default: migration },
    });
    app = express();
    app.use('/api/role', router);
  });

  beforeEach(() => {
    controller.resetHistory();
    migration.resetHistory();
    validateAccount.resetHistory();
  });

  it('does not expose the offline default-role migration through HTTP', async () => {
    await request(app).post('/api/role/migrate/defaultRoles').expect(404);
    sinon.assert.notCalled(migration);
    sinon.assert.notCalled(controller);
  });

  it('keeps ordinary room-role updates behind account validation', async () => {
    await request(app).put('/api/role/room/fixture').expect(204);
    sinon.assert.calledOnce(validateAccount);
    sinon.assert.calledOnce(controller);
    sinon.assert.callOrder(validateAccount, controller);
    sinon.assert.notCalled(migration);
  });
});
