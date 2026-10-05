import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { expect } from 'chai';
import sinon from 'sinon';
import createMediaRecovery from '../../react-client/js/utils/mediaRecovery.js';

// Execute the real client module with controlled browser/Janus dependencies.
// No Enzyme adapter or browser bundle is needed for these callback contracts.
const source = fs.readFileSync(new URL('../../react-client/js/utils/CamUtil.js', import.meta.url), 'utf8');
const { code } = transformSync(source, {
  loader: 'js',
  format: 'cjs',
  target: 'node24',
});

describe('camera failure handling', () => {
  let client;
  let callbacks;
  let plugin;
  let actions;
  let janusDestroy;
  let clock;
  let getUserMedia;
  let getDisplayMedia;
  let capture;
  let getVideoConstraints;
  let takeSelectionTracks;
  let cancelMediaSelection;

  function mediaStream(kinds = ['audio', 'video']) {
    const tracks = kinds.map(kind => ({
      kind,
      enabled: true,
      readyState: 'live',
      stop: sinon.spy(function stop() { this.readyState = 'ended'; }),
    }));
    return {
      getTracks: () => tracks,
      getAudioTracks: () => tracks.filter(track => track.kind === 'audio'),
      getVideoTracks: () => tracks.filter(track => track.kind === 'video'),
    };
  }

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  async function publish(...args) {
    client.publish(...(args.length ? args : [false, {}, 'camera', 'microphone']));
    await clock.tickAsync(0);
  }

  function expectClosed() {
    expect(actions.setMediaSelectionModalLoading.calledWith(false)).to.equal(true);
    expect(actions.setMediaSelectionModal.calledWith(false)).to.equal(true);
    expect(actions.destroyLocalStream.calledWith(null)).to.equal(true);
  }

  function expectStopped(stream) {
    stream.getTracks().forEach(track => expect(track.readyState).to.equal('ended'));
  }

  function finishOffer() {
    plugin.createOffer.lastCall.args[0].success({ type: 'offer', sdp: 'test-sdp' });
  }

  beforeEach(async () => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    capture = mediaStream();
    getUserMedia = sinon.stub().resolves(capture);
    getDisplayMedia = sinon.stub().resolves(mediaStream(['video']));
    getVideoConstraints = sinon.stub().returns({ width: 960, height: 720, frameRate: { ideal: 30, max: 30 } });
    takeSelectionTracks = sinon.stub().callsFake(() => ({ videoTrack: null, audioTrack: null, ready: Promise.resolve() }));
    cancelMediaSelection = sinon.spy();
    plugin = {
      webrtcStuff: { myStream: null },
      send: sinon.spy(),
      createOffer: sinon.spy(),
      hangup: sinon.spy(),
      detach: sinon.spy(),
      muteAudio: sinon.spy(),
      unmuteAudio: sinon.spy(),
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
      './uuid': () => 'test-uuid',
      axios: { get: async url => ({ data: url.endsWith('token')
        ? { token: 'test' } : url.includes('turn') ? { uris: [] } : [] }) },
      'janus-gateway': Janus,
      'webrtc-adapter': {},
      './mediaRecovery': createMediaRecovery,
      './mediaSelectionCapture': { takeSelectionTracks, cancelMediaSelection },
      '../stores/CamStore/CamStore': {},
      '../actions/CamActions': actions,
      './RoomAPI': actions,
      '../actions/NotificationActions': actions,
      '../actions/ModalActions': actions,
      './AnalyticsUtil': actions,
      '../constants/MediaConstants': {
        defaultVideoConstraints: { width: 320, height: 240, frameRate: { ideal: 15, max: 30 } },
        getVideoConstraints,
      },
    };
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      require(name) {
        if (!(name in mocks)) throw new Error(`Unmocked dependency: ${name}`);
        return mocks[name];
      },
      console: { log() {}, error() {}, warn() {} },
      process: { env: { NODE_ENV: 'test' } },
      navigator: { mediaDevices: { getUserMedia, getDisplayMedia } },
      MediaStream: class MediaStream {
        constructor(tracks = []) { this.tracks = [...tracks]; }
        addTrack(track) { this.tracks.push(track); }
        getTracks() { return this.tracks; }
        getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
        getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
      },
      setTimeout,
      clearTimeout,
      Date,
    });
    client = module.exports;
    await new Promise(resolve => client.init(1, 'test', 'user', resolve));
    Object.values(actions).forEach(action => action.resetHistory());
    plugin.send.resetHistory();
    cancelMediaSelection.resetHistory();
  });
  afterEach(() => {
    client?.destroy();
    clock.restore();
  });

  for (const name of ['NotAllowedError', 'NotReadableError', 'UnknownError']) {
    it(`cleans up capture ${name} and permits another broadcast attempt`, async () => {
      getUserMedia.onFirstCall().rejects(Object.assign(new Error('device failure'), { name }));
      await publish();
      expectClosed();
      expect(plugin.createOffer.called).to.equal(false);
      expect(actions.addNotification.lastCall.args[0].message).to.include('try again');
      await publish();
      expect(plugin.createOffer.calledOnce).to.equal(true);
    });
  }

  it('bounds a pending capture at 30 seconds and releases a stream that arrives after timeout', async () => {
    const pending = deferred();
    getUserMedia.onFirstCall().returns(pending.promise);
    await publish();
    await clock.tickAsync(29999);
    expect(actions.addNotification.called).to.equal(false);
    expect(plugin.createOffer.called).to.equal(false);
    await clock.tickAsync(1);
    expectClosed();
    expect(actions.addNotification.lastCall.args[0].message).to.match(/camera|microphone/i);
    pending.resolve(capture);
    await clock.tickAsync(0);
    expectStopped(capture);
    expect(plugin.createOffer.called).to.equal(false);
    capture = mediaStream();
    getUserMedia.resolves(capture);
    await publish();
    expect(plugin.createOffer.calledOnce).to.equal(true);
  });

  it('cancels pending capture, permits retry, and ignores late completion from the cancelled attempt', async () => {
    const pending = deferred();
    const lateStream = mediaStream();
    getUserMedia.onFirstCall().returns(pending.promise);
    await publish();
    client.cancelPublish();
    expectClosed();
    await publish();
    expect(plugin.createOffer.calledOnce).to.equal(true);
    pending.resolve(lateStream);
    await clock.tickAsync(0);
    expectStopped(lateStream);
    expect(capture.getTracks().every(track => track.readyState === 'live')).to.equal(true);
    expect(plugin.createOffer.calledOnce).to.equal(true);
    finishOffer();
    expect(actions.sendUserBroadcastState.calledWith(true)).to.equal(true);
  });

  it('handles synchronous capture failure without leaving the loading dialog open', async () => {
    getUserMedia.throws(new Error('capture invocation failed'));
    await publish();
    expectClosed();
    expect(plugin.createOffer.called).to.equal(false);
    expect(actions.addNotification.calledOnce).to.equal(true);
  });

  it('closes the dialog when the media plugin is missing', async () => {
    client.destroy();
    Object.values(actions).forEach(action => action.resetHistory());
    await publish();
    expectClosed();
    expect(getUserMedia.called).to.equal(false);
    expect(actions.addNotification.lastCall.args[0].message).to.match(/refresh/i);
  });

  it('bounds a stalled offer at 15 seconds and requires refresh before another capture', async () => {
    await publish();
    const offer = plugin.createOffer.firstCall.args[0];
    await clock.tickAsync(14999);
    expect(actions.addNotification.called).to.equal(false);
    await clock.tickAsync(1);
    expectClosed();
    expectStopped(capture);
    expect(plugin.detach.called).to.equal(true);
    expect(actions.addNotification.lastCall.args[0].message).to.match(/refresh/i);
    offer.success({ type: 'offer', sdp: 'late' });
    expect(plugin.send.called).to.equal(false);
    await publish();
    expect(getUserMedia.calledOnce).to.equal(true);
    expect(plugin.createOffer.calledOnce).to.equal(true);
    expect(actions.addNotification.lastCall.args[0].message).to.match(/refresh/i);
  });

  it('cancels a stalled offer, releases capture, and prevents stale callbacks from publishing', async () => {
    await publish();
    const offer = plugin.createOffer.firstCall.args[0];
    client.cancelPublish();
    expectClosed();
    expectStopped(capture);
    expect(plugin.detach.called).to.equal(true);
    offer.success({ type: 'offer', sdp: 'late' });
    offer.error(new Error('late failure'));
    await clock.tickAsync(30000);
    expect(plugin.send.called).to.equal(false);
    expect(actions.sendUserBroadcastState.calledWith(true)).to.equal(false);
    await publish();
    expect(getUserMedia.calledOnce).to.equal(true);
    expect(actions.addNotification.lastCall.args[0].message).to.match(/refresh/i);
  });

  it('cleans up pending capture on publisher cleanup and safely permits a new capture', async () => {
    const pending = deferred();
    const lateStream = mediaStream();
    getUserMedia.onFirstCall().returns(pending.promise);
    await publish();
    callbacks.oncleanup();
    expectClosed();
    await publish();
    expect(plugin.createOffer.calledOnce).to.equal(true);
    pending.resolve(lateStream);
    await clock.tickAsync(0);
    expectStopped(lateStream);
    expect(capture.getTracks().every(track => track.readyState === 'live')).to.equal(true);
    expect(plugin.createOffer.calledOnce).to.equal(true);
    finishOffer();
    expect(actions.sendUserBroadcastState.calledWith(true)).to.equal(true);
  });

  for (const interruption of ['cleanup', 'server error']) {
    it(`retires a pending offer on publisher ${interruption} and ignores its later callbacks`, async () => {
      await publish();
      const offer = plugin.createOffer.firstCall.args[0];
      if (interruption === 'cleanup') callbacks.oncleanup();
      else callbacks.onmessage({ videoroom: 'event', error: 'Publisher could not be configured' });
      expectClosed();
      expectStopped(capture);
      expect(plugin.detach.called).to.equal(true);
      offer.success({ type: 'offer', sdp: 'late' });
      offer.error(new Error('late failure'));
      expect(plugin.send.called).to.equal(false);
      expect(actions.sendUserBroadcastState.calledWith(true)).to.equal(false);
      await publish();
      expect(getUserMedia.calledOnce).to.equal(true);
      expect(actions.addNotification.lastCall.args[0].message).to.match(/refresh/i);
    });
  }

  it('keeps a new session capture alive when the retired session reports stale cleanup or offer completion', async () => {
    await publish();
    const oldCallbacks = callbacks;
    const oldOffer = plugin.createOffer.firstCall.args[0];
    callbacks.oncleanup();
    await new Promise(resolve => client.init(1, 'test', 'user', resolve));
    plugin.send.resetHistory();
    const nextCapture = mediaStream();
    getUserMedia.resolves(nextCapture);
    await publish();
    oldCallbacks.oncleanup();
    oldOffer.success({ type: 'offer', sdp: 'late' });
    oldOffer.error(new Error('late failure'));
    expect(nextCapture.getTracks().every(track => track.readyState === 'live')).to.equal(true);
    expect(plugin.send.called).to.equal(false);
    finishOffer();
    expect(actions.sendUserBroadcastState.calledWith(true)).to.equal(true);
  });

  it('handles synchronous offer failure and releases its owned tracks', async () => {
    plugin.createOffer = sinon.stub().throws(new Error('offer invocation failed'));
    await publish();
    expectClosed();
    expectStopped(capture);
    expect(actions.addNotification.calledOnce).to.equal(true);
  });

  for (const sendAudio of [false, true]) {
    it(`publishes existing capture tracks with push-to-talk ${sendAudio ? 'off' : 'on'}`, async () => {
      await publish(false, {}, 'camera', 'microphone', sendAudio);
      expect(getUserMedia.calledOnce).to.equal(true);
      expect(getUserMedia.firstCall.args[0]).to.deep.equal({
        audio: { deviceId: { exact: 'microphone' } },
        video: { deviceId: { exact: 'camera' }, width: 320, height: 240, frameRate: { ideal: 15, max: 30 } },
      });
      const offer = plugin.createOffer.firstCall.args[0];
      expect(offer.tracks.map(entry => entry.capture)).to.have.members(capture.getTracks());
      expect(offer.tracks.every(entry => entry.recv === false)).to.equal(true);
      expect(offer.tracks.map(entry => entry.type)).to.have.members(['audio', 'video']);
      expect(capture.getAudioTracks()[0].enabled).to.equal(sendAudio);
      finishOffer();
      expect(plugin.send.calledWithMatch({ message: { request: 'configure', audio: true, video: true } })).to.equal(true);
      expect(plugin.muteAudio.called).to.equal(!sendAudio);
      expect(actions.sendUserBroadcastState.calledWith(true)).to.equal(true);
      expect(actions.setMediaSelectionModal.calledWith(false)).to.equal(true);
      expect(actions.setMediaSelectionModalLoading.calledWith(false)).to.equal(true);
      client.cancelPublish();
      await clock.tickAsync(45000);
      expect(capture.getTracks().every(track => track.readyState === 'live')).to.equal(true);
      expect(actions.addNotification.called).to.equal(false);
    });
  }

  for (const laterCapture of ['rejects', 'hangs']) {
    it(`publishes the selected native tracks even when reopening those devices ${laterCapture}`, async () => {
      const [audioTrack] = capture.getAudioTracks();
      const [videoTrack] = capture.getVideoTracks();
      audioTrack.enabled = false;
      takeSelectionTracks.returns({ audioTrack, videoTrack, ready: Promise.resolve() });
      if (laterCapture === 'rejects') getUserMedia.rejects(Object.assign(new Error('device cannot be reopened'), { name: 'NotReadableError' }));
      else getUserMedia.returns(new Promise(() => {}));
      await publish(false, {}, 'camera', 'microphone', true);
      expect(takeSelectionTracks.calledWith('camera', 'microphone')).to.equal(true);
      expect(getUserMedia.called).to.equal(false);
      expect(plugin.createOffer.calledOnce).to.equal(true);
      expect(plugin.createOffer.firstCall.args[0].tracks.map(entry => entry.capture)).to.have.members([audioTrack, videoTrack]);
      finishOffer();
      expect(actions.sendUserBroadcastState.calledWith(true)).to.equal(true);
      expect(actions.setMediaSelectionModalLoading.calledWith(false)).to.equal(true);
    });
  }

  it('owns transferred tracks before their preview constraints finish, so cancelling releases them', async () => {
    const ready = deferred();
    takeSelectionTracks.returns({ audioTrack: capture.getAudioTracks()[0], videoTrack: capture.getVideoTracks()[0], ready: ready.promise });
    await publish();
    expect(plugin.createOffer.called).to.equal(false);
    expect(getUserMedia.called).to.equal(false);
    client.cancelPublish();
    expectStopped(capture);
    ready.resolve();
    await clock.tickAsync(0);
    expect(plugin.createOffer.called).to.equal(false);
    expectClosed();
  });

  it('captures only a newly selected microphone while keeping the working camera track', async () => {
    const videoTrack = capture.getVideoTracks()[0];
    takeSelectionTracks.returns({ videoTrack, audioTrack: null, ready: Promise.resolve() });
    const microphone = mediaStream(['audio']);
    getUserMedia.resolves(microphone);
    await publish(false, {}, 'camera', 'another-mic', true);
    expect(getUserMedia.calledOnce).to.equal(true);
    expect(getUserMedia.firstCall.args[0]).to.deep.equal({ audio: { deviceId: { exact: 'another-mic' } }, video: false });
    expect(plugin.createOffer.firstCall.args[0].tracks.map(entry => entry.capture)).to.have.members([videoTrack, microphone.getAudioTracks()[0]]);
    expect(videoTrack.readyState).to.equal('live');
  });

  it('captures only a newly selected camera while keeping the working microphone track', async () => {
    const audioTrack = capture.getAudioTracks()[0];
    takeSelectionTracks.returns({ videoTrack: null, audioTrack, ready: Promise.resolve() });
    const camera = mediaStream(['video']);
    getUserMedia.resolves(camera);
    await publish(false, {}, 'another-camera', 'microphone', true);
    expect(getUserMedia.calledOnce).to.equal(true);
    expect(getUserMedia.firstCall.args[0]).to.deep.equal({ audio: false, video: { deviceId: { exact: 'another-camera' }, width: 320, height: 240, frameRate: { ideal: 15, max: 30 } } });
    expect(plugin.createOffer.firstCall.args[0].tracks.map(entry => entry.capture)).to.have.members([audioTrack, camera.getVideoTracks()[0]]);
    expect(audioTrack.readyState).to.equal('live');
  });

  it('releases transferred tracks if their pending quality adjustment rejects', async () => {
    takeSelectionTracks.returns({ audioTrack: capture.getAudioTracks()[0], videoTrack: capture.getVideoTracks()[0], ready: Promise.reject(new Error('quality rejected')) });
    await publish();
    expectStopped(capture);
    expectClosed();
    expect(getUserMedia.called).to.equal(false);
    expect(plugin.createOffer.called).to.equal(false);
  });

  for (const event of ['ICE failure', 'video interruption']) {
    it(`reuses external tracks without another capture when recovering from ${event}`, async () => {
      await publish();
      finishOffer();
      if (event === 'ICE failure') callbacks.iceState('failed');
      else callbacks.mediaState('video', false);
      await clock.tickAsync(2000);
      expect(plugin.createOffer.calledTwice).to.equal(true);
      const recoveryOffer = plugin.createOffer.lastCall.args[0];
      expect(recoveryOffer.tracks).to.deep.equal([]);
      if (event === 'ICE failure') expect(recoveryOffer.iceRestart).to.equal(true);
      expect(getUserMedia.calledOnce).to.equal(true);
      recoveryOffer.success({ type: 'offer', sdp: 'recovery' });
      expect(capture.getTracks().every(track => track.readyState === 'live')).to.equal(true);
      expect(plugin.send.lastCall.args[0].jsep.sdp).to.equal('recovery');
    });
  }

  it('uses Gold constraints and simulcast options with the already captured video track', async () => {
    const quality = { id: 'VIDEO_720', bitRate: 1048576, dimensions: { width: 960, height: 720 }, frameRate: 30 };
    await publish(true, quality, 'camera', 'microphone', true);
    expect(getVideoConstraints.calledWith(quality)).to.equal(true);
    expect(getUserMedia.firstCall.args[0].video).to.deep.equal({
      deviceId: { exact: 'camera' }, width: 960, height: 720, frameRate: { ideal: 30, max: 30 },
    });
    const video = plugin.createOffer.firstCall.args[0].tracks.find(entry => entry.type === 'video');
    expect(video.capture).to.equal(capture.getVideoTracks()[0]);
    expect(video.simulcast).to.equal(true);
    expect(video.simulcastMaxBitrates).to.deep.equal({ high: quality.bitRate, medium: 0, low: 128000 });
  });

  it('closes the spinner if malformed Gold settings fail before capture', async () => {
    getVideoConstraints.throws(new Error('invalid video quality'));
    await publish(true, { id: 'VIDEO_720' }, 'camera', 'microphone', true);
    expectClosed();
    expect(getUserMedia.called).to.equal(false);
    expect(plugin.createOffer.called).to.equal(false);
    expect(actions.addNotification.calledOnce).to.equal(true);
  });

  it('captures only the selected microphone for audio-only publication', async () => {
    capture = mediaStream(['audio']);
    getUserMedia.resolves(capture);
    await publish(false, {}, null, 'microphone', true);
    expect(getUserMedia.firstCall.args[0]).to.deep.equal({ audio: { deviceId: { exact: 'microphone' } }, video: false });
    expect(plugin.createOffer.firstCall.args[0].tracks.map(entry => entry.type)).to.deep.equal(['audio']);
  });

  it('stops display capture if screen-sharing microphone acquisition fails', async () => {
    const screen = mediaStream(['video']);
    getDisplayMedia.resolves(screen);
    getUserMedia.rejects(Object.assign(new Error('microphone denied'), { name: 'NotAllowedError' }));
    await publish(false, {}, 'screen', 'microphone', true);
    expect(getDisplayMedia.calledOnce).to.equal(true);
    expectStopped(screen);
    expectClosed();
    expect(plugin.createOffer.called).to.equal(false);
  });

  it('stops committed external tracks immediately when the user stops broadcasting', async () => {
    await publish();
    finishOffer();
    client.unpublishOwnFeed();
    expectStopped(capture);
    expect(plugin.hangup.called).to.equal(true);
    expect(actions.sendUserBroadcastState.calledWith(false)).to.equal(true);
  });

  it('stops capture that resolves after leaving the room without creating an offer', async () => {
    const pending = deferred();
    getUserMedia.returns(pending.promise);
    await publish();
    client.destroy();
    actions.addNotification.resetHistory();
    pending.resolve(capture);
    await clock.tickAsync(45000);
    expectStopped(capture);
    expect(plugin.createOffer.called).to.equal(false);
    expect(actions.addNotification.called).to.equal(false);
  });

  it('releases owned media and ignores stale session callbacks after exit', async () => {
    await publish();
    client.destroy();
    expectStopped(capture);
    expect(janusDestroy.calledOnce).to.equal(true);
    actions.addNotification.resetHistory();
    callbacks.iceState('failed');
    callbacks.onmessage({ videoroom: 'destroyed' });
    expect(actions.addNotification.called).to.equal(false);
  });
});
