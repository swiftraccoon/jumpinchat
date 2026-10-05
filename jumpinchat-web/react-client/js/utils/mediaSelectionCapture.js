/* global MediaStream */

let currentSelection = null;

function stopTrack(track) {
  try {
    if (track.readyState !== 'ended') track.stop();
  } catch { /* A disconnected device may already have released its track. */ }
}

function live(entry) {
  return !entry.stopped && entry.track.readyState !== 'ended';
}

function matches(entry, deviceId) {
  return Boolean(deviceId) && live(entry) && entry.deviceIds.has(deviceId);
}

function exactDeviceId(constraints) {
  const exact = constraints && typeof constraints === 'object' ? constraints.deviceId?.exact : null;
  if (typeof exact === 'string' && exact) return exact;
  return Array.isArray(exact) && exact.length === 1 && typeof exact[0] === 'string' ? exact[0] : null;
}

function qualityConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') return {};
  return Object.fromEntries(Object.entries(constraints).filter(([key]) => key !== 'deviceId'));
}

function stableKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stopEntry(token, entry) {
  if (entry.transferred || token.entries.get(entry.track) !== entry) return;
  token.entries.delete(entry.track);
  entry.stopped = true;
  stopTrack(entry.track);
}

function owned(token, entry) {
  return isMediaSelectionCurrent(token) && token.entries.get(entry.track) === entry && live(entry);
}

function maybeReleasePreview(token, entry) {
  if (entry.releaseRequested && !entry.pinned && !entry.previewWaiters && !entry.previews.size) {
    stopEntry(token, entry);
  }
}

function observed(promise) {
  // Keep detached UI work from producing an unhandled rejection. Callers still
  // receive the original rejecting promise and can display the device error.
  promise.catch(() => {});
  return promise;
}

function configure(entry, constraints) {
  const quality = qualityConstraints(constraints);
  const key = stableKey(quality);
  if (entry.configPending && key === entry.queuedKey) return entry.ready;
  if (!entry.configPending && key === entry.configuredKey) {
    entry.queuedKey = key;
    entry.ready = Promise.resolve();
    return entry.ready;
  }
  entry.queuedKey = key;
  const pending = entry.ready.catch(() => {}).then(async () => {
    if (!live(entry) || (!entry.transferred && !owned(entry.owner, entry))) return;
    if (entry.configuredKey !== key) {
      await entry.track.applyConstraints(quality);
      if (live(entry) && (entry.transferred || owned(entry.owner, entry))) entry.configuredKey = key;
    }
  });
  entry.configPending = true;
  entry.ready = observed(pending);
  pending.then(() => {
    if (entry.ready === pending) entry.configPending = false;
  }, () => {
    if (entry.ready === pending) {
      entry.configPending = false;
      entry.queuedKey = null;
    }
  });
  return entry.ready;
}

export function beginMediaSelection() {
  cancelMediaSelection();
  currentSelection = {
    closed: false, entries: new Map(), transferredTracks: new WeakSet(),
    videoPinned: false, videoDeviceId: null,
  };
  return currentSelection;
}

export function getMediaSelection() {
  return currentSelection;
}

export function isMediaSelectionCurrent(token) {
  return Boolean(token && token === currentSelection && !token.closed);
}

export function retainSelectionStream(token, stream, constraints = {}) {
  let retained = false;
  for (const track of stream?.getTracks?.() || []) {
    if (token?.transferredTracks.has(track)) continue;
    if (track.kind === 'audio') track.enabled = false;
    if (!isMediaSelectionCurrent(token) || !['audio', 'video'].includes(track.kind)
      || track.readyState === 'ended') {
      stopTrack(track);
      continue;
    }
    let entry = token.entries.get(track);
    if (!entry) {
      let settings = {};
      try { settings = track.getSettings?.() || {}; } catch { /* Use exact acquisition metadata if needed. */ }
      const deviceIds = new Set();
      if (typeof settings.deviceId === 'string' && settings.deviceId) deviceIds.add(settings.deviceId);
      const exact = exactDeviceId(constraints[track.kind]);
      if (exact) deviceIds.add(exact);
      const configuredKey = stableKey(qualityConstraints(constraints[track.kind]));
      entry = {
        owner: token, track, deviceIds, configuredKey, queuedKey: configuredKey,
        ready: Promise.resolve(), configPending: false, previews: new Set(), previewWaiters: 0,
        pinned: false, stopped: false, transferred: false, releaseRequested: false,
      };
      token.entries.set(track, entry);
    }
    if (track.kind === 'video' && token.videoPinned) {
      if (!matches(entry, token.videoDeviceId)) {
        stopEntry(token, entry);
        continue;
      }
      entry.pinned = true;
    }
    retained = true;
  }
  return retained;
}

export function getSelectionPreview(token, deviceId, videoConstraints) {
  if (!isMediaSelectionCurrent(token)) return Promise.resolve(null);
  const entry = [...token.entries.values()].find(value => value.track.kind === 'video' && matches(value, deviceId));
  if (!entry) return Promise.resolve(null);
  entry.previewWaiters += 1;
  return observed((async () => {
    try {
      await configure(entry, videoConstraints);
      if (!owned(token, entry)) return null;
      const stream = new MediaStream([entry.track]);
      entry.previews.add(stream);
      return stream;
    } finally {
      entry.previewWaiters -= 1;
      maybeReleasePreview(token, entry);
    }
  })());
}

export function pinSelectionVideo(deviceId) {
  const token = currentSelection;
  if (!isMediaSelectionCurrent(token)) return;
  token.videoPinned = true;
  token.videoDeviceId = deviceId;
  for (const entry of [...token.entries.values()]) {
    if (entry.track.kind !== 'video') continue;
    if (matches(entry, deviceId)) entry.pinned = true;
    else stopEntry(token, entry);
  }
}

export function releaseSelectionPreview(token, stream) {
  if (!token) return;
  for (const track of stream?.getTracks?.() || []) {
    const entry = token.entries.get(track);
    if (!entry || entry.transferred) continue;
    entry.previews.delete(stream);
    entry.releaseRequested = true;
    maybeReleasePreview(token, entry);
  }
}

export function takeSelectionTracks(videoId, audioId) {
  const token = currentSelection;
  if (!isMediaSelectionCurrent(token)) {
    return { videoTrack: null, audioTrack: null, ready: Promise.resolve() };
  }
  const entries = [...token.entries.values()];
  const video = entries.find(entry => entry.track.kind === 'video' && matches(entry, videoId));
  const audio = entries.find(entry => entry.track.kind === 'audio' && matches(entry, audioId));
  for (const entry of [video, audio].filter(Boolean)) {
    token.entries.delete(entry.track);
    entry.transferred = true;
    token.transferredTracks.add(entry.track);
  }
  const ready = observed(video ? video.ready : Promise.resolve());
  cancelMediaSelection(token);
  return { videoTrack: video?.track || null, audioTrack: audio?.track || null, ready };
}

export function cancelMediaSelection(token = currentSelection) {
  if (!token) return;
  token.closed = true;
  if (currentSelection === token) currentSelection = null;
  for (const entry of [...token.entries.values()]) stopEntry(token, entry);
}
