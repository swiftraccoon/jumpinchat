// Real browser smoke for a disposable JumpInChat deployment.
// Supply Playwright externally; no application package dependency is required.
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const smokeRequire = createRequire(import.meta.url);
const { chromium } = smokeRequire(process.env.PLAYWRIGHT_PACKAGE ? path.resolve(process.env.PLAYWRIGHT_PACKAGE) : 'playwright');
assert.ok(process.env.BASE_URL, 'BASE_URL must identify the disposable deployment');
const baseURL = process.env.BASE_URL.replace(/\/$/, '');
const origin = new URL(baseURL).origin;
const outputDir = process.env.OUTPUT_DIR ? path.resolve(process.env.OUTPUT_DIR) : await fs.mkdtemp(path.join(os.tmpdir(), 'jic-media-smoke-'));
const phase = process.env.PHASE || 'all';
assert.ok(['all', 'direct', 'relay', 'permissions', 'network'].includes(phase), 'PHASE must be all, direct, relay, permissions or network');
const stamp = process.env.ROOM_SUFFIX || String(Date.now()).slice(-8);
const permittedHosts = [...new Set([new URL(baseURL).hostname, ...(process.env.EXTRA_HOSTS || '').split(',').filter(Boolean)])];
await fs.mkdir(outputDir, { recursive: true });
const tonePath = path.join(outputDir, 'synthetic-microphone.wav');
const sampleRate = 48000;
const sampleCount = sampleRate * 10;
const wave = Buffer.alloc(44 + sampleCount * 2);
wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28);
wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(sampleCount * 2, 40);
for (let index = 0; index < sampleCount; index += 1) wave.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * index / sampleRate) * 8000), 44 + index * 2);
await fs.writeFile(tonePath, wave);
const result = { startedAt: new Date().toISOString(), phase, baseURL, checks: [], clients: [], limits: ['Synthetic camera test pattern and generated 440Hz microphone tone; no real hardware.', 'The observer filters non-isolated ICE servers, including the hardcoded public Google STUN server.', 'Relay phase changes only RTCPeerConnection iceTransportPolicy to relay; all app, Socket.IO and Janus traffic is real.'] };
const clients = [];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }),
  args: [...(process.env.TLS_SPKI ? [`--ignore-certificate-errors-spki-list=${process.env.TLS_SPKI}`] : []), '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', `--use-file-for-fake-audio-capture=${tonePath}`, '--disable-dev-shm-usage'],
});
console.log('BROWSER', browser.version());
result.browserVersion = browser.version();

function check(name, details) {
  result.checks.push({ name, time: new Date().toISOString(), details });
  console.log('PASS', name, JSON.stringify(details));
}

async function observe(context, relay) {
  await context.addInitScript(({ relay, permittedHosts }) => {
    const diagnostics = { pcs: [], websockets: [], roomMessages: [], handleDialogOpenings: 0, chatRecoveryNotices: 0, sessionErrorSeen: false, streams: [], mediaRequests: [], removedIceServers: [] };
    window.__mediaSmoke = diagnostics;
    let handleWasOpen = false;
    let recoveryNoticeWasVisible = false;
    new MutationObserver(() => {
      const open = !!document.querySelector('[role="dialog"][aria-label="Change handle"]');
      if (open && !handleWasOpen) diagnostics.handleDialogOpenings += 1;
      handleWasOpen = open;
      const recoveryNoticeVisible = [...document.querySelectorAll('.banner')].some(element => element.textContent.includes('Chat server reconnected'));
      if (recoveryNoticeVisible && !recoveryNoticeWasVisible) diagnostics.chatRecoveryNotices += 1;
      recoveryNoticeWasVisible = recoveryNoticeVisible;
      if (document.body?.textContent.toLowerCase().includes('no session, try refreshing')) diagnostics.sessionErrorSeen = true;
    }).observe(document, { childList: true, characterData: true, subtree: true });
    const NativePeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = class ObservedPeerConnection extends NativePeerConnection {
      constructor(configuration = {}, constraints) {
        const iceServers = (configuration.iceServers || []).flatMap(server => {
          const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => {
            const host = String(url).replace(/^(stun|stuns|turn|turns):/, '').replace(/^\/\//, '').split(/[?:]/)[0];
            const allowed = permittedHosts.includes(host);
            if (!allowed) diagnostics.removedIceServers.push(url);
            return allowed;
          });
          return urls.length ? [{ ...server, urls }] : [];
        });
        super({ ...configuration, iceServers, ...(relay ? { iceTransportPolicy: 'relay' } : {}) }, constraints);
        diagnostics.pcs.push(this);
      }
    };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class ObservedWebSocket extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        diagnostics.websockets.push(this);
        this.addEventListener('message', event => {
          if (!this.url.includes('/socket.io/') || typeof event.data !== 'string' || !event.data.startsWith('42')) return;
          try {
            const [name, payload] = JSON.parse(event.data.slice(2));
            if (name === 'room::message') diagnostics.roomMessages.push({ message: payload.message, userId: payload.userId });
            if (name === 'client::error' && (payload.error === 'ENOSESSION' || String(payload.message).toLowerCase().includes('no session, try refreshing'))) diagnostics.sessionErrorSeen = true;
          } catch { /* Ignore transport packets that are not JSON events. */ }
        });
      }
    };
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const entry = { constraints, startedAt: Date.now() };
      diagnostics.mediaRequests.push(entry);
      try {
        const stream = await getUserMedia(constraints);
        diagnostics.streams.push(stream);
        entry.tracks = stream.getTracks().map(track => ({ kind: track.kind, label: track.label }));
        entry.result = 'success';
        return stream;
      } catch (error) {
        entry.result = error.name;
        entry.message = error.message;
        throw error;
      }
    };
  }, { relay, permittedHosts });
}

async function createClient(name, room, relay = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['camera', 'microphone'] });
  await observe(context, relay);
  const data = { name, room, relay, errors: [], consoleErrors: [], failedRequests: [], roomResponses: [], blockedExternalRequests: [] };
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (permittedHosts.includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    data.blockedExternalRequests.push(url.origin + url.pathname);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => data.errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') data.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => data.failedRequests.push({ url: request.url().split('?')[0], reason: request.failure()?.errorText }));
  page.on('response', response => {
    if (new URL(response.url()).pathname === `/api/rooms/${room}`) data.roomResponses.push(response.status());
  });
  const client = { context, page, data };
  clients.push(client);
  result.clients.push(data);
  await page.goto(`${baseURL}/${room}`, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog', { name: 'Change handle' });
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Go', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: /Start Broadcasting/ }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Start Broadcasting') && !button.disabled), null, { timeout: 40000 });
  check(`${name}: joined room and initialized Janus`, { roomResponses: data.roomResponses });
  return client;
}

async function chat(sender, receiver, message) {
  const input = sender.page.getByPlaceholder('Start typing');
  await input.fill(message);
  await input.press('Enter');
  await assertChatReceived(sender, receiver, message);
  check(`${sender.data.name} → ${receiver.data.name}: chat`, { message, userId: sender.data.roomUserId });
}

async function assertChatReceived(sender, receiver, message) {
  await receiver.page.getByText(message, { exact: true }).waitFor();
  const received = await receiver.page.evaluate(message => window.__mediaSmoke.roomMessages.filter(entry => entry.message === message), message);
  assert.equal(received.length, 1, 'The real Socket.IO event must deliver the message exactly once');
  assert.equal(await receiver.page.getByText(message, { exact: true }).count(), 1, 'The received chat must render exactly once');
  const [{ userId }] = received;
  assert.ok(userId, 'The actual received Socket.IO message must identify its room user');
  if (sender.data.roomUserId) assert.equal(userId, sender.data.roomUserId, 'Chat must preserve the room user identity after reconnect');
  sender.data.roomUserId = userId;
}

async function assertHealthyChatRecovery(client) {
  assert.equal(await client.page.getByText('Unable to establish connection to chat server', { exact: true }).count(), 0, 'Successful recovery must remove the connection-failure notice');
  assert.equal(await client.page.evaluate(() => window.__mediaSmoke.sessionErrorSeen), false, 'No message may be rejected for a missing room session during recovery');
}

async function chooseVideo(client) {
  const { page } = client;
  await page.getByRole('button', { name: /Start Broadcasting/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Media selection modal' });
  const camera = dialog.locator('button.mediaSources__SourceWrapper').filter({ has: page.locator('video') }).first();
  await camera.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.mediaSources__SourceWrapper video')].some(video => video.videoWidth > 0), null, { timeout: 30000 });
  await camera.click();
  const ptt = dialog.locator('#mediaPttCheckbox');
  await ptt.waitFor({ state: 'attached' });
  if (await ptt.isChecked()) await dialog.locator('label[for="mediaPttCheckbox"] button').click();
  assert.equal(await ptt.isChecked(), false, 'Push to talk must be off for continuous audio evidence');
  await page.waitForFunction(() => window.__mediaSmoke.streams.length > 0 && window.__mediaSmoke.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
  check(`${client.data.name}: permission-check and preview capture tracks released after device selection`);
  return dialog;
}

async function publish(client) {
  const dialog = await chooseVideo(client);
  await dialog.locator('button.mediaSources__SourceWrapper').first().click();
  await dialog.waitFor({ state: 'hidden' });
  await client.page.getByRole('button', { name: /Stop Broadcasting/ }).waitFor();
  check(`${client.data.name}: published synthetic camera and microphone`);
}

async function snapshot(client) {
  return client.page.evaluate(async () => {
    const diagnostics = window.__mediaSmoke;
    const connections = [];
    for (const [connectionId, pc] of diagnostics.pcs.entries()) {
      const stats = [...(await pc.getStats()).values()].map(value => ({ ...value }));
      const selectedIds = stats.filter(value => value.type === 'transport').map(value => value.selectedCandidatePairId).filter(Boolean);
      const selected = stats.filter(value => value.type === 'candidate-pair' && (selectedIds.length ? selectedIds.includes(value.id) : (value.nominated && value.state === 'succeeded'))).map(pair => ({ ...pair, local: stats.find(value => value.id === pair.localCandidateId), remote: stats.find(value => value.id === pair.remoteCandidateId) }));
      connections.push({ connectionId, connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState, iceTransportPolicy: pc.getConfiguration().iceTransportPolicy, stats, selected });
    }
    return {
      connections,
      mediaRequests: diagnostics.mediaRequests,
      handleDialogOpenings: diagnostics.handleDialogOpenings,
      chatRecoveryNotices: diagnostics.chatRecoveryNotices,
      sessionErrorSeen: diagnostics.sessionErrorSeen,
      roomHandles: [...document.querySelectorAll('.userList__UserHandle')].map(element => element.textContent.trim()).sort(),
      captureTracks: diagnostics.streams.flatMap(stream => stream.getTracks().map(track => ({ kind: track.kind, readyState: track.readyState, enabled: track.enabled }))),
      removedIceServers: diagnostics.removedIceServers,
      videos: [...document.querySelectorAll('video.cams__CamVideo')].map(video => ({ width: video.videoWidth, height: video.videoHeight, currentTime: video.currentTime, paused: video.paused, muted: video.muted, volume: video.volume, tracks: video.srcObject?.getTracks().map(track => ({ kind: track.kind, enabled: track.enabled, readyState: track.readyState })) })),
      websocketStates: diagnostics.websockets.map(socket => ({ url: socket.url.split('?')[0], protocol: socket.protocol, state: socket.readyState })),
    };
  });
}

function totals(snapshot) {
  const output = { outboundVideoFrames: 0, inboundVideoFrames: 0, outboundVideoBytes: 0, inboundVideoBytes: 0, outboundAudioBytes: 0, inboundAudioBytes: 0, inboundAudioEnergy: 0, outboundAudioPackets: 0, inboundAudioPackets: 0, selectedCandidateTypes: [] };
  for (const connection of snapshot.connections.filter(value => value.connectionState !== 'closed')) {
    output.selectedCandidateTypes.push(...connection.selected.map(pair => pair.local?.candidateType));
    for (const entry of connection.stats) {
      const kind = entry.kind || entry.mediaType;
      if (entry.type === 'outbound-rtp' && kind === 'video') { output.outboundVideoFrames += entry.framesSent || entry.framesEncoded || 0; output.outboundVideoBytes += entry.bytesSent || 0; }
      if (entry.type === 'inbound-rtp' && kind === 'video') { output.inboundVideoFrames += entry.framesDecoded || 0; output.inboundVideoBytes += entry.bytesReceived || 0; }
      if (entry.type === 'outbound-rtp' && kind === 'audio') { output.outboundAudioBytes += entry.bytesSent || 0; output.outboundAudioPackets += entry.packetsSent || 0; }
      if (entry.type === 'inbound-rtp' && kind === 'audio') { output.inboundAudioBytes += entry.bytesReceived || 0; output.inboundAudioPackets += entry.packetsReceived || 0; output.inboundAudioEnergy += entry.totalAudioEnergy || 0; }
    }
  }
  return output;
}

async function waitMedia(client, relay = false) {
  const deadline = Date.now() + 45000;
  let measurement;
  do {
    measurement = await snapshot(client);
    const values = totals(measurement);
    if (values.outboundVideoFrames > 10 && values.inboundVideoFrames > 10 && values.outboundAudioBytes > 1000 && values.inboundAudioBytes > 1000 && values.inboundAudioEnergy > 0 && measurement.videos.filter(video => video.width > 0 && !video.paused).length >= 2) {
      if (relay) {
        const active = measurement.connections.filter(connection => connection.connectionState === 'connected' && connection.stats.some(entry => ['inbound-rtp', 'outbound-rtp'].includes(entry.type) && (entry.bytesSent > 0 || entry.bytesReceived > 0)));
        assert.ok(active.length >= 2, 'Publisher and subscriber connections must both be active');
        active.forEach(connection => {
          assert.equal(connection.iceTransportPolicy, 'relay');
          assert.ok(connection.selected.length > 0 && connection.selected.every(pair => pair.local?.candidateType === 'relay'), 'Every active media connection must have a selected TURN relay pair');
        });
      }
      check(`${client.data.name}: bidirectional ${relay ? 'TURN relay ' : ''}audio/video`, values);
      (client.data.measurements ||= []).push({ name: 'initial-media', snapshot: measurement });
      return measurement;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  client.data.lastMediaSnapshot = measurement;
  throw new Error(`${client.data.name}: media did not flow in both directions: ${JSON.stringify(totals(measurement))}`);
}

async function mediaProgress(client, prior, name) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  const current = await snapshot(client);
  const before = totals(prior); const after = totals(current);
  for (const key of ['outboundVideoFrames', 'inboundVideoFrames', 'outboundAudioBytes', 'inboundAudioBytes', 'inboundAudioEnergy']) assert.ok(after[key] > before[key], `${client.data.name}: ${key} must increase`);
  check(`${client.data.name}: ${name}`, { before, after });
  (client.data.measurements ||= []).push({ name, snapshot: current });
  return current;
}

function assertMediaTopology(client, measurement) {
  const active = measurement.connections.filter(connection => connection.connectionState !== 'closed');
  assert.equal(active.length, 2, `${client.data.name}: this two-publisher room must retain exactly one publishing and one receiving PeerConnection, with no orphan subscriptions`);
  active.forEach(connection => assert.equal(connection.connectionState, 'connected', `${client.data.name}: every retained media connection must be connected`));
  for (const type of ['inbound-rtp', 'outbound-rtp']) {
    assert.equal(active.filter(connection => connection.stats.some(entry => entry.type === type && (entry.bytesReceived > 0 || entry.bytesSent > 0))).length, 1, `${client.data.name}: exactly one PeerConnection must carry ${type}`);
  }
  assert.equal(measurement.videos.length, 2, `${client.data.name}: exactly the local and remote video must remain rendered`);
}

async function reconnectJanus(client) {
  const before = await snapshot(client);
  const oldSocketCount = before.websocketStates.length;
  const closed = await client.page.evaluate(() => {
    const sockets = window.__mediaSmoke.websockets.filter(socket => socket.protocol === 'janus-protocol' && socket.readyState === WebSocket.OPEN);
    sockets.forEach(socket => socket.close());
    return sockets.length;
  });
  assert.ok(closed > 0, 'A real connected Janus WebSocket must be interrupted');
  await client.page.getByText('Reconnected to media server', { exact: true }).waitFor({ timeout: 20000 });
  const restored = await waitMedia(client);
  assert.ok(restored.websocketStates.length > oldSocketCount, 'Janus recovery must open a new native WebSocket');
  await mediaProgress(client, restored, 'media advancing after Janus reconnect');
  check(`${client.data.name}: Janus WebSocket session reclaimed`, { closedSockets: closed });
}

async function reconnect(client, other) {
  const original = await snapshot(client);
  const connected = await client.page.evaluate(() => window.__mediaSmoke.websockets.filter(socket => socket.url.includes('/socket.io/') && socket.readyState === WebSocket.OPEN).length);
  assert.ok(connected > 0, 'A real connected Socket.IO WebSocket must exist before interruption');
  await client.context.setOffline(true);
  const closed = await client.page.evaluate(() => {
    const sockets = window.__mediaSmoke.websockets.filter(socket => socket.url.includes('/socket.io/') && socket.readyState === WebSocket.OPEN);
    sockets.forEach(socket => socket.close());
    return sockets.length;
  });
  await client.page.getByText('Chat server disconnected', { exact: true }).waitFor();
  const queuedMessage = `queued-offline-${stamp}-${client.data.name}`;
  const input = client.page.getByPlaceholder('Start typing');
  await input.fill(queuedMessage);
  await input.press('Enter');
  await client.page.waitForFunction(() => document.querySelector('[placeholder="Start typing"]').value === '');
  assert.equal(await other.page.getByText(queuedMessage, { exact: true }).count(), 0, 'An offline submission must wait for room session recovery');
  await new Promise(resolve => setTimeout(resolve, 4000));
  assert.equal(await other.page.evaluate(message => window.__mediaSmoke.roomMessages.filter(entry => entry.message === message).length, queuedMessage), 0, 'The queued message must not be emitted while disconnected');
  await client.context.setOffline(false);
  await client.page.getByText('Chat server reconnected', { exact: true }).waitFor({ timeout: 20000 });
  await assertChatReceived(client, other, queuedMessage);
  await assertHealthyChatRecovery(client);
  const remapped = await snapshot(client);
  assert.equal(remapped.handleDialogOpenings, original.handleDialogOpenings, 'Reconnect must not reopen the nickname dialog');
  assert.equal(remapped.websocketStates.filter(socket => socket.protocol === 'janus-protocol').length, original.websocketStates.filter(socket => socket.protocol === 'janus-protocol').length, 'Socket.IO reconnect must not reset the Janus session');
  assert.equal(remapped.connections.length, original.connections.length, 'Socket.IO reconnect must preserve the media PeerConnections');
  await chat(client, other, `reconnect-${stamp}-${client.data.name}`);
  await chat(other, client, `reconnect-return-${stamp}-${other.data.name}`);
  const restored = await Promise.all([snapshot(client), snapshot(other)]);
  assert.deepEqual(restored[0].roomHandles, original.roomHandles, 'Reconnect must preserve the local room user list');
  assert.deepEqual(restored[1].roomHandles, original.roomHandles, 'Reconnect must preserve the peer room user list');
  await Promise.all([
    mediaProgress(client, restored[0], 'media advancing after signaling reconnect'),
    mediaProgress(other, restored[1], 'media advancing after peer signaling reconnect'),
  ]);
  await assertChatReceived(client, other, queuedMessage);
  await assertHealthyChatRecovery(client);
  await assertHealthyChatRecovery(other);
  check(`${client.data.name}: offline Enter submission delivered once after session recovery`, { message: queuedMessage, userId: client.data.roomUserId, draftCleared: true });
  check(`${client.data.name}: Socket.IO interruption recovered`, { connectedBeforeOffline: connected, explicitlyClosed: closed });
}

async function networkOutage(alice, bob, room) {
  const original = await Promise.all([snapshot(alice), snapshot(bob)]);
  [alice, bob].forEach((client, index) => assertMediaTopology(client, original[index]));
  const controlDir = process.env.NETWORK_CONTROL_DIR || path.join(outputDir, 'network-control');
  await fs.mkdir(controlDir);
  const writeMarker = (name, details = {}) => fs.writeFile(path.join(controlDir, `${name}.json`), JSON.stringify({ time: new Date().toISOString(), room, ...details }));
  async function waitMarker(name) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try { return JSON.parse(await fs.readFile(path.join(controlDir, `${name}.json`), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for external network controller: ${name}`);
  }
  await writeMarker('ready');
  console.log('NETWORK_READY', controlDir);
  await waitMarker('disconnected');
  let frozen;
  try {
    await new Promise(resolve => setTimeout(resolve, 4000));
    const before = await Promise.all([snapshot(alice), snapshot(bob)]);
    await new Promise(resolve => setTimeout(resolve, 3000));
    frozen = await Promise.all([snapshot(alice), snapshot(bob)]);
    [alice, bob].forEach((client, index) => {
      const prior = totals(before[index]); const current = totals(frozen[index]);
      const priorStats = new Map(before[index].connections.flatMap(connection => connection.stats.filter(entry => entry.type === 'inbound-rtp').map(entry => [`${connection.connectionId}:${entry.id}`, entry])));
      frozen[index].connections.forEach(connection => connection.stats.filter(entry => entry.type === 'inbound-rtp').forEach(entry => {
        const earlier = priorStats.get(`${connection.connectionId}:${entry.id}`);
        for (const key of ['framesDecoded', 'bytesReceived', 'packetsReceived']) assert.ok((entry[key] || 0) <= (earlier?.[key] || 0), `${client.data.name}: inbound ${entry.id} ${key} must stop advancing during the real network outage`);
      }));
      check(`${client.data.name}: inbound media frozen during container network outage`, { before: prior, after: current });
      (client.data.measurements ||= []).push({ name: 'network-disconnected', snapshot: frozen[index] });
    });
  } finally {
    await writeMarker('resume-requested');
  }
  await waitMarker('reconnected');
  const deadline = Date.now() + 60000;
  let resumed = false;
  while (Date.now() < deadline) {
    const before = await Promise.all([snapshot(alice), snapshot(bob)]);
    await new Promise(resolve => setTimeout(resolve, 3000));
    const after = await Promise.all([snapshot(alice), snapshot(bob)]);
    resumed = after.every((measurement, index) => measurement.videos.filter(video => video.width > 0 && !video.paused).length >= 2 && ['outboundVideoFrames', 'inboundVideoFrames', 'outboundAudioBytes', 'inboundAudioBytes', 'inboundAudioEnergy'].every(key => totals(measurement)[key] > totals(before[index])[key]));
    if (resumed) {
      [alice, bob].forEach((client, index) => {
        check(`${client.data.name}: media resumed after real container network outage`, { before: totals(before[index]), after: totals(after[index]) });
        (client.data.measurements ||= []).push({ name: 'network-reconnected', snapshot: after[index] });
      });
      break;
    }
  }
  assert.ok(resumed, 'Both browsers must resume decoded audio/video progress after reconnecting the container network');
  await Promise.all([alice, bob].map(async (client, index) => {
    await client.page.waitForFunction(({ socketCount, recoveryNotices }) => {
      const sockets = window.__mediaSmoke.websockets.filter(socket => socket.url.includes('/socket.io/'));
      if (!sockets.some(socket => socket.readyState === WebSocket.OPEN)) return false;
      return sockets.length === socketCount || window.__mediaSmoke.chatRecoveryNotices > recoveryNotices;
    }, { socketCount: original[index].websocketStates.filter(socket => socket.url.includes('/socket.io/')).length, recoveryNotices: original[index].chatRecoveryNotices }, { timeout: 30000 });
    await assertHealthyChatRecovery(client);
  }));
  await chat(alice, bob, `network-return-${stamp}-alice`);
  await chat(bob, alice, `network-return-${stamp}-bob`);
  const restored = await Promise.all([snapshot(alice), snapshot(bob)]);
  const stable = await Promise.all([alice, bob].map((client, index) => mediaProgress(client, restored[index], 'media advancing after network and chat session recovery')));
  [alice, bob].forEach((client, index) => {
    assertMediaTopology(client, stable[index]);
    assert.deepEqual(stable[index].roomHandles, original[index].roomHandles, 'Network recovery must preserve the room user list');
    assert.equal(stable[index].handleDialogOpenings, original[index].handleDialogOpenings, 'Network recovery must not reopen the nickname dialog');
    check(`${client.data.name}: network recovery preserves media topology without duplicate subscribers`, { activeConnections: stable[index].connections.filter(connection => connection.connectionState !== 'closed').length, videos: stable[index].videos.length });
  });
  await Promise.all([assertHealthyChatRecovery(alice), assertHealthyChatRecovery(bob)]);
  await writeMarker('complete');
}

async function deniedPermission(room) {
  const client = await createClient('DeniedCamera', room);
  const dialog = await chooseVideo(client);
  await client.context.grantPermissions(['microphone'], { origin });
  await dialog.locator('button.mediaSources__SourceWrapper').first().click();
  await client.page.getByText('Camera or microphone permission was denied. Allow access in your browser and try again.', { exact: true }).waitFor();
  await dialog.waitFor({ state: 'hidden' });
  await client.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Start Broadcasting') && !button.disabled));
  const measurement = await snapshot(client);
  assert.ok(measurement.mediaRequests.some(request => request.result === 'NotAllowedError'));
  assert.equal(totals(measurement).outboundVideoBytes, 0);
  assert.ok(measurement.captureTracks.length > 0 && measurement.captureTracks.every(track => track.readyState === 'ended'), 'Denied publish must leave no live permission-check or preview capture tracks');
  check('Denied camera: real getUserMedia rejection and UI cleanup', { results: measurement.mediaRequests.map(request => request.result), captureTracks: measurement.captureTracks });
  await client.context.grantPermissions(['camera', 'microphone'], { origin });
  await publish(client);
  const restored = await waitMedia(client);
  await mediaProgress(client, restored, 'media advancing after permission regrant and retry');
  await client.page.getByRole('button', { name: /Stop Broadcasting/ }).click();
  await client.page.waitForFunction(() => window.__mediaSmoke.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
  check('Camera permission regrant: publication succeeds and stopping releases capture');
  await client.context.close();
}

try {
  if (phase === 'all' || phase === 'direct') {
    const room = `av${stamp}`;
    const alice = await createClient('SmokeAlice', room);
    assert.ok(alice.data.roomResponses.includes(201), 'First guest must create the real Mongo/Janus room');
    const bob = await createClient('SmokeBob', room);
    assert.ok(bob.data.roomResponses.includes(200), 'Second guest must join the existing room');
    await chat(alice, bob, `alice-${stamp}`);
    await chat(bob, alice, `bob-${stamp}`);
    await publish(alice);
    await publish(bob);
    const first = await Promise.all([waitMedia(alice), waitMedia(bob)]);
    await Promise.all([mediaProgress(alice, first[0], 'media counters advancing'), mediaProgress(bob, first[1], 'media counters advancing')]);
    await reconnectJanus(bob);
    await reconnect(alice, bob);
    await deniedPermission(room);
    await alice.page.screenshot({ path: path.join(outputDir, 'direct-alice.png'), fullPage: true });
    await bob.page.screenshot({ path: path.join(outputDir, 'direct-bob.png'), fullPage: true });
    await alice.context.close(); await bob.context.close();
  }
  if (phase === 'network') {
    const room = `network${stamp}`;
    const alice = await createClient('NetworkAlice', room);
    const bob = await createClient('NetworkBob', room);
    await publish(alice); await publish(bob);
    await Promise.all([waitMedia(alice), waitMedia(bob)]);
    await chat(alice, bob, `network-before-${stamp}-alice`);
    await chat(bob, alice, `network-before-${stamp}-bob`);
    await networkOutage(alice, bob, room);
    await alice.context.close(); await bob.context.close();
  }
  if (phase === 'permissions') {
    const room = `denied${stamp}`;
    const peer = await createClient('PermissionPeer', room);
    await publish(peer);
    await deniedPermission(room);
    await peer.context.close();
  }
  if (phase === 'all' || phase === 'relay') {
    const room = `relay${stamp}`;
    const alice = await createClient('RelayAlice', room, true);
    const bob = await createClient('RelayBob', room, true);
    await publish(alice); await publish(bob);
    const first = await Promise.all([waitMedia(alice, true), waitMedia(bob, true)]);
    await Promise.all([mediaProgress(alice, first[0], 'TURN media counters advancing'), mediaProgress(bob, first[1], 'TURN media counters advancing')]);
    await alice.page.screenshot({ path: path.join(outputDir, 'relay-alice.png'), fullPage: true });
    await alice.context.close(); await bob.context.close();
  }
  assert.ok(result.clients.every(client => client.errors.length === 0), 'Unexpected browser page errors occurred; inspect the client diagnostics');
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.failure = error.stack || error.message;
  console.error('FAIL', result.failure);
  process.exitCode = 1;
} finally {
  for (const client of clients) {
    if (!client.page.isClosed()) {
      client.data.finalMediaSnapshot = await snapshot(client).catch(error => ({ error: error.message }));
      client.data.finalText = await client.page.locator('body').innerText().catch(() => 'unavailable');
      await client.page.screenshot({ path: path.join(outputDir, `${client.data.name}-final.png`), fullPage: true }).catch(() => {});
    }
  }
  result.finishedAt = new Date().toISOString();
  try {
    await fs.writeFile(path.join(outputDir, `result-${phase}.json`), JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
  console.log('RESULT', result.status, path.join(outputDir, `result-${phase}.json`));
}
