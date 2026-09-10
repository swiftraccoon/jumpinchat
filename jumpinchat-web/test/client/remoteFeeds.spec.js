import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { expect } from 'chai';
import sinon from 'sinon';
import createMediaRecovery from '../../react-client/js/utils/mediaRecovery.js';

const { code } = transformSync(fs.readFileSync(new URL('../../react-client/js/utils/CamUtil.js', import.meta.url), 'utf8'), {
  loader: 'js', format: 'cjs', target: 'node24',
});

class TestMediaStream {
  constructor() { this.tracks = []; }
  getTracks() { return this.tracks; }
  addTrack(track) { if (!this.tracks.includes(track)) this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter(value => value !== track); }
}
const mediaTrack = kind => ({ kind, stop: sinon.spy() });

describe('remote subscriber lifecycle', () => {
  let client;
  let publisherCallbacks;
  let publisher;
  let subscribers;
  let actions;
  let clock;

  function remoteHandle(callbacks) {
    const handle = {
      rfid: 42,
      webrtcStuff: { pc: { connectionState: 'connected', iceConnectionState: 'connected' } },
      send: sinon.spy(), createAnswer: sinon.spy(),
      detach: sinon.spy(() => {
        handle.detached = true;
        handle.webrtcStuff.pc = null;
        callbacks.oncleanup();
      }),
      hangup: sinon.spy(() => {
        handle.webrtcStuff.pc = null;
        callbacks.oncleanup();
      }),
    };
    return handle;
  }

  function announce(event = 'event') {
    publisherCallbacks.onmessage({ videoroom: event, publishers: [{
      id: 42, display: 'remote-user', video_codec: 'vp8', audio_codec: 'opus',
    }] });
  }

  function attach(index = subscribers.length - 1) {
    const callbacks = subscribers[index];
    const handle = remoteHandle(callbacks);
    callbacks.success(handle);
    return { callbacks, handle };
  }

  beforeEach(async () => {
    subscribers = [];
    actions = new Proxy({}, { get(target, name) {
      if (!target[name]) target[name] = sinon.spy();
      return target[name];
    } });
    publisher = {
      webrtcStuff: {}, send: sinon.spy(), hangup: sinon.spy(),
      createOffer: sinon.spy(options => options.success({ type: 'offer', sdp: 'fixture' })),
    };
    function Janus(options) {
      let managerAttached = false;
      this.attach = (callbacks) => {
        if (!managerAttached) {
          managerAttached = true;
          publisherCallbacks = callbacks;
          callbacks.success(publisher);
        } else subscribers.push(callbacks);
      };
      this.destroy = sinon.spy();
      queueMicrotask(options.success);
    }
    Janus.init = options => options.callback();
    Janus.isWebrtcSupported = () => true;
    Janus.useDefaultDependencies = () => ({});
    Janus.webRTCAdapter = { browserDetails: { browser: 'chrome' } };
    Janus.log = () => {};
    const mocks = {
      './uuid': () => 'fixture-token',
      axios: { get: async url => ({ data: url.endsWith('token')
        ? { token: 'fixture' } : url.includes('turn') ? { uris: [] } : [] }) },
      'janus-gateway': Janus, 'webrtc-adapter': {},
      './mediaRecovery': createMediaRecovery,
      '../stores/CamStore/CamStore': { getState: () => ({ camsDisabled: false, allFeedsHd: true }) },
      '../actions/CamActions': actions, './RoomAPI': actions,
      '../actions/NotificationActions': actions, '../actions/ModalActions': actions,
      './AnalyticsUtil': actions, '../constants/MediaConstants': { defaultVideoConstraints: {} },
    };
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module, exports: module.exports,
      require(name) {
        if (!(name in mocks)) throw new Error(`Unmocked dependency: ${name}`);
        return mocks[name];
      },
      MediaStream: TestMediaStream,
      console: { log() {}, warn() {}, error() {} },
      process: { env: { NODE_ENV: 'test' } },
      setTimeout: (...args) => setTimeout(...args), clearTimeout: (...args) => clearTimeout(...args),
    });
    client = module.exports;
    await new Promise(resolve => client.init(1, 'fixture-room', 'local-user', resolve));
  });

  afterEach(() => {
    client.destroy();
    clock?.restore();
    clock = null;
  });

  it('reserves a pending subscriber before repeated joined/event publisher announcements', () => {
    announce('joined');
    announce();
    client.newRemoteFeed('42', 1, 'remote-user', 'vp8', 'opus');
    expect(subscribers.length).to.equal(1);
    const { handle } = attach();
    expect(handle.send.firstCall.args[0].message).to.include({ request: 'join', feed: 42 });
  });

  it('keeps one active subscriber when media renegotiation repeats a publisher announcement', () => {
    announce();
    const { handle } = attach();
    clock = sinon.useFakeTimers();
    publisherCallbacks.mediaState('video', false);
    clock.tick(2000);
    expect(publisher.createOffer.calledOnce).to.equal(true);
    announce();
    announce();
    expect(subscribers.length).to.equal(1);
    expect(handle.detach.called).to.equal(false);
  });

  it('retains the recovering subscriber while its ICE state is only disconnected', () => {
    announce();
    const { handle } = attach();
    handle.webrtcStuff.pc.connectionState = 'disconnected';
    handle.webrtcStuff.pc.iceConnectionState = 'disconnected';
    announce();
    expect(subscribers.length).to.equal(1);
    expect(handle.detach.called).to.equal(false);
  });

  it('detaches a failed receiver before attaching one replacement', () => {
    announce();
    const { handle } = attach();
    handle.webrtcStuff.pc.connectionState = 'failed';
    announce();
    announce();
    expect(handle.detach.calledOnce).to.equal(true);
    expect(subscribers.length).to.equal(2);
  });

  it('permits intentional hangup/resume without letting old cleanup evict the replacement', () => {
    announce();
    const old = attach();
    old.handle.hangup();
    expect(old.handle.detach.calledOnce).to.equal(true);
    client.newRemoteFeed(42, 1, 'remote-user', 'vp8', 'opus');
    old.callbacks.oncleanup();
    old.callbacks.ondetached();
    announce();
    expect(subscribers.length).to.equal(2);
    attach();
    announce();
    expect(subscribers.length).to.equal(2);
  });

  it('releases the reservation after an attach failure', () => {
    announce();
    subscribers[0].error(new Error('attach failed'));
    announce();
    expect(subscribers.length).to.equal(2);
  });

  it('releases and detaches a rejected subscriber join so it can retry', () => {
    announce();
    const { handle, callbacks } = attach();
    callbacks.onmessage({ videoroom: 'event', error_code: 428, error: 'No such feed' });
    expect(handle.detach.calledOnce).to.equal(true);
    announce();
    expect(subscribers.length).to.equal(2);
  });

  it('releases an answer failure and ignores the stale answer callback after replacement', () => {
    announce();
    const { handle, callbacks } = attach();
    callbacks.onmessage({ videoroom: 'attached', id: 42 }, { type: 'offer', sdp: 'fixture' });
    const answer = handle.createAnswer.firstCall.args[0];
    answer.error(new Error('answer failed'));
    announce();
    answer.success({ type: 'answer', sdp: 'stale' });
    expect(handle.send.callCount).to.equal(1);
    expect(subscribers.length).to.equal(2);
  });

  it('uses Janus ondetached to release a receiver and allow a later retry', () => {
    announce();
    const old = attach();
    old.callbacks.ondetached();
    announce();
    expect(subscribers.length).to.equal(2);
  });

  it('cancels an unpublished pending feed and detaches its late attachment', () => {
    announce();
    const pending = subscribers[0];
    publisherCallbacks.onmessage({ videoroom: 'event', unpublished: 42 });
    expect(actions.destroyRemoteStream.calledWith(42)).to.equal(true);
    announce();
    const stale = remoteHandle(pending);
    pending.success(stale);
    expect(stale.detach.calledOnce).to.equal(true);
    expect(stale.send.called).to.equal(false);
    announce();
    expect(subscribers.length).to.equal(2);
  });

  it('assembles audio/video tracks on one stream and stops them when the receiver closes', () => {
    announce();
    const { callbacks, handle } = attach();
    const audio = mediaTrack('audio'); const video = mediaTrack('video');
    callbacks.onremotetrack(audio, 'a', true);
    callbacks.onremotetrack(video, 'v', true);
    expect(actions.addRemoteStream.callCount).to.equal(2);
    const firstStream = actions.addRemoteStream.firstCall.args[0].stream;
    expect(actions.addRemoteStream.lastCall.args[0].stream).to.equal(firstStream);
    expect(firstStream.getTracks()).to.eql([audio, video]);
    callbacks.onremotetrack(audio, 'a', false);
    expect(firstStream.getTracks()).to.eql([video]);
    handle.hangup();
    expect(video.stop.calledOnce).to.equal(true);
  });

  it('ignores callbacks from a departed session and preserves a new session reservation', async () => {
    announce();
    const pending = subscribers[0];
    client.destroy();
    await new Promise(resolve => client.init(1, 'fixture-room', 'local-user', resolve));
    announce();
    const stale = remoteHandle(pending);
    pending.success(stale);
    const track = mediaTrack('video');
    pending.onremotetrack(track, 'v', true);
    pending.onmessage({ videoroom: 'attached', id: 42 }, { type: 'offer', sdp: 'stale' });
    pending.oncleanup();
    announce();
    expect(stale.detach.calledOnce).to.equal(true);
    expect(stale.send.called).to.equal(false);
    expect(stale.createAnswer.called).to.equal(false);
    expect(track.stop.calledOnce).to.equal(true);
    expect(actions.addRemoteStream.called).to.equal(false);
    expect(subscribers.length).to.equal(2);
  });
});
