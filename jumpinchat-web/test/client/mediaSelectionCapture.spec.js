import { expect } from 'chai';
import sinon from 'sinon';
import {
  beginMediaSelection, getMediaSelection, isMediaSelectionCurrent,
  retainSelectionStream, getSelectionPreview, pinSelectionVideo,
  releaseSelectionPreview, takeSelectionTracks, cancelMediaSelection,
} from '../../react-client/js/utils/mediaSelectionCapture.js';

class TestStream {
  constructor(tracks = []) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
}

function track(kind, deviceId) {
  const value = {
    kind, readyState: 'live', enabled: true,
    getSettings: () => deviceId ? { deviceId } : {},
    applyConstraints: sinon.stub().resolves(),
  };
  value.stop = sinon.spy(() => { value.readyState = 'ended'; });
  return value;
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const quality = { width: 320, height: 240, frameRate: { ideal: 15, max: 30 } };

describe('media selection capture ownership', () => {
  let originalMediaStream;
  beforeEach(() => {
    originalMediaStream = globalThis.MediaStream;
    globalThis.MediaStream = TestStream;
    cancelMediaSelection();
  });
  afterEach(() => {
    cancelMediaSelection();
    if (originalMediaStream === undefined) delete globalThis.MediaStream;
    else globalThis.MediaStream = originalMediaStream;
  });

  it('owns the initial tracks, immediately silences audio, and replaces old sessions safely', () => {
    const token = beginMediaSelection();
    const audio = track('audio', 'mic'); const video = track('video', 'cam');
    expect(retainSelectionStream(token, new TestStream([audio, video]), { audio: true, video: quality })).to.equal(true);
    expect(audio.enabled).to.equal(false);
    const newer = beginMediaSelection();
    expect(isMediaSelectionCurrent(token)).to.equal(false);
    expect(getMediaSelection()).to.equal(newer);
    expect(audio.stop.calledOnce && video.stop.calledOnce).to.equal(true);
    cancelMediaSelection(token);
    expect(isMediaSelectionCurrent(newer)).to.equal(true);
  });

  it('reuses a known camera as a video-only preview without reapplying unchanged quality', async () => {
    const token = beginMediaSelection();
    const audio = track('audio', 'mic'); const video = track('video', 'cam');
    retainSelectionStream(token, new TestStream([audio, video]), {
      audio: true, video: { deviceId: { exact: 'cam' }, ...quality },
    });
    const preview = await getSelectionPreview(token, 'cam', quality);
    expect(preview.getTracks()).to.deep.equal([video]);
    expect(preview.getAudioTracks()).to.deep.equal([]);
    expect(video.applyConstraints.called).to.equal(false);
    expect(await getSelectionPreview(token, 'other-camera', quality)).to.equal(null);
  });

  it('matches exact acquisition metadata when settings omit device identity', () => {
    const token = beginMediaSelection(); const audio = track('audio'); const video = track('video');
    retainSelectionStream(token, new TestStream([audio, video]), {
      audio: { deviceId: { exact: 'default' } }, video: { deviceId: { exact: 'cam' }, ...quality },
    });
    const selected = takeSelectionTracks('cam', 'default');
    expect(selected.audioTrack).to.equal(audio);
    expect(selected.videoTrack).to.equal(video);
    expect(audio.stop.called || video.stop.called).to.equal(false);
  });

  it('never treats unconstrained, ideal, or ambiguous acquisition IDs as a default-device match', () => {
    for (const audioConstraints of [true, { deviceId: 'default' }, { deviceId: { ideal: 'default' } },
      { deviceId: { exact: ['default', 'other-mic'] } }]) {
      const token = beginMediaSelection(); const audio = track('audio');
      retainSelectionStream(token, new TestStream([audio]), { audio: audioConstraints });
      expect(takeSelectionTracks(null, 'default').audioTrack).to.equal(null);
      expect(audio.stop.calledOnce).to.equal(true);
    }
  });

  it('pins a selected camera through preview release and rejects late unselected captures', async () => {
    const token = beginMediaSelection(); const video = track('video', 'cam'); const other = track('video', 'other');
    retainSelectionStream(token, new TestStream([video, other]), { video: quality });
    const preview = await getSelectionPreview(token, 'cam', quality);
    pinSelectionVideo('cam');
    releaseSelectionPreview(token, preview);
    expect(video.stop.called).to.equal(false);
    expect(other.stop.calledOnce).to.equal(true);
    const late = track('video', 'other');
    expect(retainSelectionStream(token, new TestStream([late]), { video: quality })).to.equal(false);
    expect(late.stop.calledOnce).to.equal(true);
    expect(takeSelectionTracks('cam', null).videoTrack).to.equal(video);
  });

  it('pins an acquisition still pending and retains it when it eventually arrives', () => {
    const token = beginMediaSelection(); pinSelectionVideo('cam');
    const video = track('video', 'cam');
    expect(retainSelectionStream(token, new TestStream([video]), { video: quality })).to.equal(true);
    releaseSelectionPreview(token, new TestStream([video]));
    expect(video.stop.called).to.equal(false);
    expect(takeSelectionTracks('cam', null).videoTrack).to.equal(video);
  });

  it('stops all late captures after cancellation without disturbing a newer session', () => {
    const token = beginMediaSelection(); const newer = beginMediaSelection();
    const audio = track('audio', 'mic'); const video = track('video', 'cam');
    expect(retainSelectionStream(token, new TestStream([audio, video]), { audio: true, video: quality })).to.equal(false);
    expect(audio.stop.calledOnce && video.stop.calledOnce).to.equal(true);
    expect(isMediaSelectionCurrent(newer)).to.equal(true);
  });

  it('transfers selected tracks atomically and waits for configuration without exposing a late preview', async () => {
    const token = beginMediaSelection(); const audio = track('audio', 'mic'); const video = track('video', 'cam');
    const extra = track('video', 'unused'); const configuring = deferred();
    video.applyConstraints.returns(configuring.promise);
    retainSelectionStream(token, new TestStream([audio, video, extra]), { audio: true, video: quality });
    const preview = await getSelectionPreview(token, 'cam', quality);
    const pendingPreview = getSelectionPreview(token, 'cam', { ...quality, width: 640 });
    await flush();
    const selected = takeSelectionTracks('cam', 'mic');
    let ready = false; selected.ready.then(() => { ready = true; });
    expect(getMediaSelection()).to.equal(null);
    expect(selected.videoTrack).to.equal(video); expect(selected.audioTrack).to.equal(audio);
    expect(extra.stop.calledOnce).to.equal(true);
    releaseSelectionPreview(token, preview); cancelMediaSelection(token);
    retainSelectionStream(token, new TestStream([audio, video]), { audio: true, video: quality });
    expect(audio.stop.called || video.stop.called).to.equal(false);
    await flush(); expect(ready).to.equal(false);
    configuring.resolve(); await selected.ready;
    expect(await pendingPreview).to.equal(null);
    expect(ready).to.equal(true);
  });

  it('shares identical pending configuration and retains a track until all previews release it', async () => {
    const token = beginMediaSelection(); const video = track('video', 'cam'); const configuring = deferred();
    video.applyConstraints.returns(configuring.promise);
    retainSelectionStream(token, new TestStream([video]), { video: quality });
    const requested = { ...quality, width: 640 };
    const first = getSelectionPreview(token, 'cam', requested);
    const second = getSelectionPreview(token, 'cam', { deviceId: { exact: 'cam' }, ...requested });
    await flush(); expect(video.applyConstraints.calledOnce).to.equal(true);
    configuring.resolve(); const [one, two] = await Promise.all([first, second]);
    releaseSelectionPreview(token, one); expect(video.stop.called).to.equal(false);
    releaseSelectionPreview(token, two); expect(video.stop.calledOnce).to.equal(true);
  });

  it('serializes differing quality requests and transfers only after the latest configuration finishes', async () => {
    const token = beginMediaSelection(); const video = track('video', 'cam');
    const first = deferred(); const second = deferred();
    video.applyConstraints.onFirstCall().returns(first.promise);
    video.applyConstraints.onSecondCall().returns(second.promise);
    retainSelectionStream(token, new TestStream([video]), { video: quality });
    const firstPreview = getSelectionPreview(token, 'cam', { ...quality, width: 640 });
    const secondPreview = getSelectionPreview(token, 'cam', { ...quality, width: 960 });
    await flush(); expect(video.applyConstraints.calledOnce).to.equal(true);
    const selected = takeSelectionTracks('cam', null);
    first.resolve(); await flush(); expect(video.applyConstraints.calledTwice).to.equal(true);
    expect(video.applyConstraints.secondCall.args[0].width).to.equal(960);
    second.resolve(); await selected.ready;
    expect(await firstPreview).to.equal(null); expect(await secondPreview).to.equal(null);
    expect(video.stop.called).to.equal(false);
  });

  it('does not stop a track when an older preview releases during replacement configuration', async () => {
    const token = beginMediaSelection(); const video = track('video', 'cam'); const configuring = deferred();
    retainSelectionStream(token, new TestStream([video]), { video: quality });
    const first = await getSelectionPreview(token, 'cam', quality);
    video.applyConstraints.returns(configuring.promise);
    const next = getSelectionPreview(token, 'cam', { ...quality, width: 640 });
    releaseSelectionPreview(token, first); expect(video.stop.called).to.equal(false);
    configuring.resolve(); const nextPreview = await next;
    expect(nextPreview.getVideoTracks()).to.deep.equal([video]);
    releaseSelectionPreview(token, nextPreview); expect(video.stop.calledOnce).to.equal(true);
  });

  it('reports failed constraints to the caller and permits a later configuration retry', async () => {
    const token = beginMediaSelection(); const video = track('video', 'cam');
    retainSelectionStream(token, new TestStream([video]), { video: quality });
    const failure = new Error('Unsupported quality');
    video.applyConstraints.onFirstCall().rejects(failure);
    video.applyConstraints.onSecondCall().resolves();
    const requested = { ...quality, width: 640 };
    let caught;
    try { await getSelectionPreview(token, 'cam', requested); } catch (error) { caught = error; }
    expect(caught).to.equal(failure);
    const preview = await getSelectionPreview(token, 'cam', requested);
    expect(preview.getVideoTracks()).to.deep.equal([video]);
    expect(video.applyConstraints.calledTwice).to.equal(true);
  });

  it('stops cancelled configuration tracks and prevents its completion from changing a newer owner', async () => {
    const token = beginMediaSelection(); const video = track('video', 'cam'); const configuring = deferred();
    video.applyConstraints.returns(configuring.promise);
    retainSelectionStream(token, new TestStream([video]), { video: quality });
    const preview = getSelectionPreview(token, 'cam', { ...quality, width: 640 });
    await flush(); const newer = beginMediaSelection();
    expect(video.stop.calledOnce).to.equal(true);
    configuring.resolve(); expect(await preview).to.equal(null);
    expect(isMediaSelectionCurrent(newer)).to.equal(true);
  });

  it('is safe without a session and never transfers ended tracks', async () => {
    expect(await getSelectionPreview(null, 'cam', quality)).to.equal(null);
    pinSelectionVideo('cam'); releaseSelectionPreview(null, new TestStream()); cancelMediaSelection();
    expect(takeSelectionTracks('cam', 'mic')).to.include({ videoTrack: null, audioTrack: null });
    const token = beginMediaSelection(); const video = track('video', 'cam');
    retainSelectionStream(token, new TestStream([video]), { video: quality }); video.stop();
    expect(takeSelectionTracks('cam', null).videoTrack).to.equal(null);
  });
});
