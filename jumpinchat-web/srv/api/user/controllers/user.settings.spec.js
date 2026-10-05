import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import User from '../user.model.js';

describe('default dark account preferences', () => {
  it('creates accounts dark by default and preserves stored light preferences', () => {
    expect(new User().settings.darkTheme).to.equal(true);
    expect(new User({ settings: { darkTheme: false } }).settings.darkTheme).to.equal(false);
  });
  for (const saved of [true, false, undefined]) {
    it(`preserves ${saved} when unrelated settings omit darkTheme`, async () => {
      const user = { settings: { darkTheme: saved }, save: sinon.stub().resolves() };
      const update = await esmock('./user.settings.js', {
        '../user.utils.js': { default: { getUserById: (_id, callback) => callback(null, user) } },
        '../../../utils/logger.util.js': { default: () => ({ debug() {}, warn() {}, fatal() {} }) },
      });
      const res = { status: sinon.stub().returnsThis(), send: sinon.spy() };
      update({ params: { id: 'account' }, body: { playYtVideos: true } }, res);
      await Promise.resolve();
      expect(user.settings.darkTheme).to.equal(saved !== false);
      expect(res.status.calledWith(200)).to.equal(true);
    });
  }
  it('accepts an explicit light preference without treating false as missing', async () => {
    const user = { settings: { darkTheme: true }, save: sinon.stub().resolves() };
    const update = await esmock('./user.settings.js', {
      '../user.utils.js': { default: { getUserById: (_id, callback) => callback(null, user) } },
      '../../../utils/logger.util.js': { default: () => ({ debug() {}, warn() {}, fatal() {} }) },
    });
    update({ params: { id: 'account' }, body: { darkTheme: false } }, { status: sinon.stub().returnsThis(), send() {} });
    expect(user.settings.darkTheme).to.equal(false);
  });
});
