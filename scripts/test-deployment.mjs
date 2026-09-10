#!/usr/bin/env node
// Creates synthetic accounts, rooms and uploads in an isolated lite deployment.
// The caller owns deployment creation and teardown; existing deployments must not be used.
import assert from 'node:assert/strict';
import https from 'node:https';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  origin: { type: 'string' }, host: { type: 'string' }, smtp: { type: 'string' },
  ca: { type: 'string' }, report: { type: 'string' },
} });
assert.ok(values.origin && values.host && values.smtp && values.ca,
  'Supply --origin https://127.0.0.1:PORT --host HOST --smtp http://127.0.0.1:PORT/messages --ca CERT [--report FILE]');
const origin = new URL(values.origin);
assert.equal(origin.protocol, 'https:');
assert.equal(origin.hostname, '127.0.0.1');
const ca = await readFile(values.ca);
const sink = new URL(values.smtp);
assert.equal(sink.hostname, '127.0.0.1');
assert.equal(sink.protocol, 'http:');
const require = createRequire(new URL('../jumpinchat-web/package.json', import.meta.url));
const { Jimp } = require('jimp');
const fixture = await new Jimp({ width: 80, height: 60, color: 0x3974baff }).getBuffer('image/png');
const username = `smoke${randomBytes(6).toString('hex')}`;
const email = `${username}@example.com`;
const password = randomBytes(20).toString('hex');
const checks = [];
const cookies = new Map();

function request(route, { method = 'GET', form, json, multipart } = {}) {
  let data;
  const headers = { Host: values.host, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') };
  if (form) {
    data = Buffer.from(new URLSearchParams(form).toString());
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (json) {
    data = Buffer.from(JSON.stringify(json));
    headers['Content-Type'] = 'application/json';
  } else if (multipart) {
    const boundary = `jicsmoke${randomBytes(10).toString('hex')}`;
    data = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n`),
      fixture, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  }
  if (data) headers['Content-Length'] = data.length;
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(route, origin), {
      method, headers, ca, timeout: 30000,
    }, res => {
      const buffers = [];
      for (const cookie of res.headers['set-cookie'] || []) {
        const pair = cookie.split(';')[0];
        const separator = pair.indexOf('=');
        const key = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (value) cookies.set(key, value); else cookies.delete(key);
      }
      res.on('data', buffer => buffers.push(buffer));
      res.on('end', () => {
        const body = Buffer.concat(buffers);
        resolve({ status: res.statusCode, headers: res.headers, body,
          text: () => body.toString(), json: () => JSON.parse(body.toString()) });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`Request timed out: ${method} ${route}`)));
    req.on('error', reject);
    req.end(data);
  });
}

function status(response, expected, label) {
  assert.equal(response.status, expected, `${label}: HTTP ${response.status}`);
}
function pass(label) { checks.push(label); console.log(`PASS ${label}`); }

for (const route of ['/', '/register', '/login', '/directory']) {
  const response = await request(route);
  status(response, 200, route);
  assert.match(response.headers['content-type'], /text\/html/);
}
pass('Homepage, registration, login and directory pages render through TLS');
const registered = await request('/register', { method: 'POST', form: {
  action: 'register', username, email, password, phone6tY4bPYk: '',
} });
status(registered, 302, 'Registration');
assert.equal(registered.headers.location, `/${username}`, 'Registration must create the account room');
pass('Homepage registration creates an account and reserved room');

const sessionResponse = await request('/api/user/session', { method: 'POST', json: {} });
status(sessionResponse, 200, 'Authenticated session');
const session = sessionResponse.json();
assert.equal(session.user.username, username);
const userId = session.user.user_id;
assert.ok(userId);
status(await request('/settings/account'), 200, 'Account settings');
const roomPage = await request(`/${username}`);
status(roomPage, 200, 'Room page');
assert.match(roomPage.text(), /<html/i);
pass('Registered session is shared between homepage and room application');

const mailResponse = await fetch(sink, { signal: AbortSignal.timeout(10000) });
assert.equal(mailResponse.status, 200);
const messages = await mailResponse.json();
const message = messages.find(value => value.to.some(recipient => recipient.includes(email)));
assert.ok(message, 'Registration must deliver a verification email to the local SMTP sink');
const mime = message.mime.replace(/=\r?\n/g, '').replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
const verification = mime.match(/\/verify-email\/([0-9a-f]{64})/);
assert.ok(verification, 'Captured MIME must contain a verification link');
const verified = await request(`/verify-email/${verification[1]}`);
status(verified, 200, 'Email verification');
assert.match(verified.text(), /Your email has been verified, thanks!/);
pass('Registration mail reaches local SMTP and its link verifies the account');

for (const [label, route, width, height] of [
  ['Avatar', `/api/user/${userId}/uploadImage`, 256, 256],
  ['Room cover', `/api/rooms/${username}/uploadImage`, 640, 480],
]) {
  const uploaded = await request(route, { method: 'PUT', multipart: true });
  status(uploaded, 200, `${label} upload`);
  const imagePath = uploaded.json().url;
  assert.match(imagePath, /\.png$/);
  const served = await request(`/uploads/${imagePath}`);
  status(served, 200, `${label} readback`);
  assert.match(served.headers['content-type'], /image\/png/);
  const decoded = await Jimp.read(served.body);
  assert.equal(decoded.bitmap.width, width);
  assert.equal(decoded.bitmap.height, height);
  // The server contains the source image, so differing aspect ratios add padding.
  assert.equal(decoded.getPixelColor(Math.floor(width / 2), Math.floor(height / 2)), 0x3974baff);
  if (label === 'Avatar') {
    const profile = await request(`/api/user/${userId}/profile`);
    status(profile, 200, 'Profile');
    assert.equal(profile.json().pic, imagePath);
  }
  pass(`${label} uploads, persists and reads back at ${width}x${height}`);
}

status(await request('/api/user/logout', { method: 'POST', json: {} }), 200, 'Logout');
const guest = await request('/api/user/session', { method: 'POST', json: {} });
status(guest, 200, 'Guest session');
assert.equal(guest.json().user, undefined);
const login = await request('/login', { method: 'POST', form: { action: 'login', username, password } });
status(login, 302, 'Returning login');
const returning = await request('/api/user/session', { method: 'POST', json: {} });
status(returning, 200, 'Returning session');
assert.equal(returning.json().user.user_id, userId);
pass('Logout clears identity and returning login restores the same account');

const summary = { checkedAt: new Date().toISOString(), origin: origin.origin, checks, username, userId, email };
if (values.report) await writeFile(values.report, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ checks: checks.length, username, userId }));
