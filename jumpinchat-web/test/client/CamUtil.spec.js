import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from '@babel/core';
import { expect } from 'chai';
import sinon from 'sinon';
import createMediaRecovery from '../../react-client/js/utils/mediaRecovery.js';

// Execute the real client module with controlled browser/Janus dependencies.
// No Enzyme adapter or browser bundle is needed for these callback contracts.
const source = fs.readFileSync(new URL('../../react-client/js/utils/CamUtil.js', import.meta.url), 'utf8');
const { code } = transformSync(source, {
  babelrc: false,
  configFile: false,
  presets: [['@babel/preset-env', { targets: { node: '22' } }]],
});

describe('camera failure handling', () => {
  let client;
  let callbacks;
  let plugin;
  let actions;
  let track;
  let janusDestroy;
  beforeEach(async () => {
    track = { stop: sinon.spy() };
    plugin = {
      webrtcStuff: { myStream: { getTracks: () => [track] } },
      send: sinon.spy(),
      createOffer: sinon.spy(),
      hangup: sinon.spy(),
    };
    actions = new Proxy({}, {
      get(target, name) {
        if (!target[name]) target[name] = sinon.spy();
        return target[name];
      },
    });
    janusDestroy = sinon.spy();
    function Janus(options) {
      this.attach = (opts) => {
        callbacks = opts;
        opts.success(plugin);
      };
      this.destroy = janusDestroy;
      queueMicrotask(options.success);
    }
    Janus.init = opts => opts.callback();
    Janus.isWebrtcSupported = () => true;
    Janus.useDefaultDependencies = () => ({});
    const mocks = {
      uuid: {},
      axios: { get: async url => ({ data: url.endsWith('token')
        ? { token: 'test' } : url.includes('turn') ? { uris: [] } : [] }) },
      'janus-gateway': Janus,
      'webrtc-adapter': {},
      './mediaRecovery': createMediaRecovery,
      '../stores/CamStore/CamStore': {},
      '../actions/CamActions': actions,
      './RoomAPI': actions,
      '../actions/NotificationActions': actions,
      '../actions/ModalActions': actions,
      './AnalyticsUtil': actions,
      '../constants/MediaConstants': { defaultVideoConstraints: {} },
    };
    const module = { exports: {} };
    vm.runInNewContext(code, {
      exports: module.exports,
      require(name) {
        if (!(name in mocks)) throw new Error(`Unmocked dependency: ${name}`);
        return mocks[name];
      },
      console: { log() {}, error() {}, warn() {} },
      process: { env: { NODE_ENV: 'test' } },
      setTimeout,
      clearTimeout,
    });
    client = module.exports;
    await new Promise(resolve => client.init(1, 'test', 'user', resolve));
  });
  afterEach(() => client.destroy());

  for (const name of ['NotAllowedError', 'NotReadableError', 'UnknownError']) {
    it(`cleans up ${name} and permits another broadcast attempt`, () => {
      client.publish(false, {}, 'camera', 'microphone');
      const offer = plugin.createOffer.firstCall.args[0];
      expect(() => offer.error({ name, message: 'device failure' })).not.to.throw();
      expect(actions.setMediaSelectionModalLoading.calledWith(false)).to.equal(true);
      expect(actions.destroyLocalStream.calledWith(null)).to.equal(true);
      expect(track.stop.calledOnce).to.equal(true);
      expect(actions.addNotification.lastCall.args[0].message).to.include('try again');
      client.publish(false, {}, 'camera', 'microphone');
      expect(plugin.createOffer.calledTwice).to.equal(true);
    });
  }

  it('releases media and ignores stale session callbacks after exit', () => {
    client.destroy();
    expect(track.stop.calledOnce).to.equal(true);
    expect(janusDestroy.calledOnce).to.equal(true);
    actions.addNotification.resetHistory();
    callbacks.iceState('failed');
    callbacks.onmessage({ videoroom: 'destroyed' });
    expect(actions.addNotification.called).to.equal(false);
  });
});
