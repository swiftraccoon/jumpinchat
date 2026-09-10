#!/usr/bin/env node
// Run against fresh local processes only. Never accepts an existing database URI.
// NODE24 scripts/test-runtime.mjs --mongod /path/to/mongod --redis /path/to/redis-server
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webPath = path.join(root, 'jumpinchat-web');
const homePath = path.join(root, 'jumpinchat-homepage');
const requireWeb = createRequire(path.join(webPath, 'package.json'));
const mongoose = requireWeb('mongoose');
const { MongoClient } = requireWeb('mongodb');
const { createClient } = requireWeb('redis');
const { io } = requireWeb('socket.io-client');
const bcrypt = requireWeb('bcrypt');
const args = process.argv.slice(2);
const mongod = args[args.indexOf('--mongod') + 1];
const redisBinary = args[args.indexOf('--redis') + 1];
const mongodump = args.includes('--mongodump') ? args[args.indexOf('--mongodump') + 1] : null;
const mongorestore = args.includes('--mongorestore') ? args[args.indexOf('--mongorestore') + 1] : null;
assert.ok(args.includes('--mongod') && args.includes('--redis'),
  'Supply --mongod and --redis binary paths; existing server URIs are not accepted');
assert.equal(process.versions.node.split('.')[0], '24', 'Run with Node 24 LTS');
assert.equal(Boolean(mongodump), Boolean(mongorestore), 'Supply both Database Tools paths or neither');
await Promise.all([mongod, redisBinary, mongodump, mongorestore].filter(Boolean).map(binary => access(binary)));

const temporary = await mkdtemp(path.join(tmpdir(), 'jic-runtime-test-'));
const children = [];
const sockets = [];
const connections = [];
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    interrupted = true;
    children.forEach(({ child }) => child.kill('SIGTERM'));
  });
}

async function port() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const allocated = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return allocated;
}

function start(name, binary, childArgs, cwd, env = {}) {
  const logPath = path.join(temporary, `${name}.log`);
  const output = createWriteStream(logPath);
  const child = spawn(binary, childArgs, {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output);
  child.stderr.pipe(output);
  child.on('error', error => { child.startError = error; });
  children.push({ name, child, output, logPath });
  return child;
}

async function until(check, label) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (interrupted) throw new Error('Runtime test interrupted');
    try { if (await check()) return; } catch (error) { lastError = error; }
    const exited = children.find(({ child }) => !child.plannedStop
      && (child.exitCode !== null || child.signalCode !== null));
    if (exited) throw new Error(`${exited.name} exited with ${exited.child.exitCode}`);
    const failed = children.find(({ child }) => child.startError);
    if (failed) throw failed.child.startError;
    await delay(150);
  }
  throw new Error(`Timed out: ${label}`, { cause: lastError });
}

async function stop(child) {
  child.plannedStop = true;
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(12000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

function browser(origin) {
  const cookies = new Map();
  return {
    cookie: () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
    async request(route, body, method = body ? 'POST' : 'GET') {
      const response = await fetch(`${origin}${route}`, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
        headers: {
          'X-Forwarded-Proto': 'https',
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0];
        const separator = pair.indexOf('=');
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      return response;
    },
  };
}

function event(socket, name) {
  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timeout);
      socket.off(name, received);
      socket.off('client::error', clientError);
      socket.off('connect_error', connectionError);
      if (error) reject(error); else resolve(value);
    };
    const received = value => finish(null, value);
    const clientError = error => finish(new Error(JSON.stringify(error)));
    const connectionError = error => finish(error);
    const timeout = setTimeout(() => finish(new Error(`Socket event timed out: ${name}`)), 6000);
    socket.once(name, received);
    socket.once('client::error', clientError);
    socket.once('connect_error', connectionError);
  });
}

try {
  const [mongoPort, redisPort, webPort, web2Port, homePort] = await Promise.all(
    Array.from({ length: 5 }, () => port()),
  );
  await mkdir(path.join(temporary, 'db'));
  start('mongodb', mongod, ['--dbpath', path.join(temporary, 'db'), '--port', String(mongoPort),
    '--bind_ip', '127.0.0.1', '--replSet', 'rs0'], temporary);
  start('redis', redisBinary, ['--port', String(redisPort), '--bind', '127.0.0.1',
    '--save', '', '--appendonly', 'no', '--dir', temporary], temporary);
  const mongoUri = `mongodb://127.0.0.1:${mongoPort}/jic_runtime_test?replicaSet=rs0&directConnection=true`;
  const mongo = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 500 });
  connections.push(() => mongo.close());
  await until(async () => { await mongo.connect(); return mongo.db().admin().command({ ping: 1 }); }, 'MongoDB startup');
  await mongo.db().admin().command({ replSetInitiate: {
    _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }],
  } });
  await until(async () => (await mongo.db().admin().command({ hello: 1 })).isWritablePrimary,
    'replica primary');
  const redisUri = `redis://127.0.0.1:${redisPort}`;
  const redis = createClient({ url: redisUri, socket: { connectTimeout: 1000, reconnectStrategy: false } });
  redis.on('error', () => {});
  await redis.connect();
  connections.push(() => redis.close());
  const serverVersion = (await mongo.db().admin().command({ buildInfo: 1 })).version;
  assert.match(serverVersion, /^8\.3\./);
  assert.match(await redis.info('server'), /redis_version:8\.10\.1/);
  console.log(`Runtime: Node ${process.versions.node}, MongoDB ${serverVersion}, Redis 8.10.1`);

  const paymentSuite = await execute(process.execPath, [
    '--loader=esmock', path.join(webPath, 'node_modules/mocha/bin/mocha.js'),
    '-t', '10000', 'test/payment/fulfillment.mongo.spec.js',
  ], {
    cwd: webPath,
    env: { PATH: process.env.PATH, NODE_ENV: 'test', MONGODB_URI: mongoUri, REDIS_URI: redisUri,
      PAYMENT_TEST_MONGO_URI: `mongodb://127.0.0.1:${mongoPort}/unused?replicaSet=rs0&directConnection=true` },
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  process.stdout.write(paymentSuite.stdout);
  console.log('PASS payment durability, replay, index and concurrency integration against isolated MongoDB');

  const environment = {
    NODE_ENV: 'production', MONGODB_URI: mongoUri, REDIS_URI: redisUri,
    COOKIE_SECRET: 'runtime-fixture-cookie-secret', JWT_SECRET: 'runtime-fixture-jwt-secret',
    SHARED_SECRET: 'runtime-fixture-shared-secret', FILE_TOKEN_SECRET: 'runtime-fixture-file-secret',
    JANUS_TOKEN_SECRET: 'runtime-fixture-janus-secret', JANUS_SERVER_IDS: 'jic-runtime-test.invalid',
    JANUS_HTTPS_URI: '/janus/http', JANUS_WSS_URI: '/janus/ws',
    JANUS_HTTP_URI_INTERNAL: 'http://127.0.0.1:1/janus',
    EMAIL_URL: 'http://127.0.0.1:1', STORAGE_BACKEND: 'local',
    UPLOAD_BASE_PATH: path.join(temporary, 'uploads'),
    API_URL: `http://127.0.0.1:${webPort}`,
  };
  start('web', process.execPath, ['srv/index.js'], webPath, { ...environment, PORT: String(webPort) });
  start('web2', process.execPath, ['srv/index.js'], webPath, { ...environment, PORT: String(web2Port) });
  start('homepage', process.execPath, ['app.js'], homePath, { ...environment, PORT: String(homePort) });
  for (const target of [webPort, web2Port, homePort]) {
    await until(async () => (await fetch(`http://127.0.0.1:${target}/health/ready`)).ok, 'app readiness');
  }
  console.log('PASS web/web2/home readiness: ODM, node-redis sessions, ioredis adapter, connect-mongo');

  await mongoose.connect(mongoUri);
  connections.push(() => mongoose.disconnect());
  const { default: User } = await import(pathToFileURL(path.join(webPath, 'srv/api/user/user.model.js')));
  const { default: Room } = await import(pathToFileURL(path.join(webPath, 'srv/api/room/room.model.js')));
  const password = 'runtime-fixture-password';
  const passhash = await bcrypt.hash(password, 10);
  await User.create({ username: 'runtimefixture', auth: { email: 'runtime@example.invalid', passhash } });
  await User.create({ username: 'runtimefixturemfa', auth: {
    email: 'runtime-mfa@example.invalid', passhash, totpSecret: 'JBSWY3DPEHPK3PXP',
  } });
  await Room.create({ name: 'runtimesmoke', attrs: {
    janus_id: '12345', janusServerId: 'jic-runtime-test.invalid',
  } });

  const web = browser(`http://127.0.0.1:${webPort}`);
  const home = browser(`http://127.0.0.1:${homePort}`);
  let response = await web.request('/runtimesmoke');
  assert.equal(response.status, 200);
  const roomHtml = await response.text();
  assert.match(roomHtml, /runtimesmoke \| JumpInChat/);
  assert.match(roomHtml, /window\.SUPPORT_ENABLED = false/);
  response = await home.request('/login');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Log into your account/);
  console.log('PASS EJS 6 room and Pug homepage rendering');
  response = await web.request('/api/payment/session', {});
  assert.equal(response.status, 503);
  console.log('PASS startup and disabled-payment response without Stripe credentials');

  response = await web.request('/api/user/login', { username: 'runtimefixture', password });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.user.username, 'runtimefixture');
  response = await web.request('/api/user/session', {});
  assert.equal((await response.json()).user.username, 'runtimefixture');
  console.log('PASS bcrypt login and returning-account session');

  response = await home.request('/login', { action: 'login', username: 'runtimefixturemfa', password });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/login/totp');
  const session = await mongo.db().collection('sessions').findOne({});
  assert.ok(JSON.parse(session.session).user);
  assert.ok((await mongo.db().collection('sessions').indexes())
    .some(index => index.key.expires && index.expireAfterSeconds === 0));
  response = await home.request('/login/totp');
  assert.equal(response.status, 200);
  console.log('PASS connect-mongo 6 session write/read and TTL index creation');

  const guests = [];
  const guestSessions = [];
  for (const target of [webPort, web2Port]) {
    const guest = browser(`http://127.0.0.1:${target}`);
    const first = await guest.request('/api/user/session', {});
    assert.equal(first.status, 200);
    const { token } = await first.json();
    const second = await guest.request('/api/user/session', {});
    assert.equal((await second.json()).token, token);
    const socket = io(`http://127.0.0.1:${target}`, {
      auth: { token }, extraHeaders: { Cookie: guest.cookie(), 'X-Forwarded-Proto': 'https' },
      transports: ['websocket'], autoConnect: false, reconnection: false,
    });
    sockets.push(socket);
    const connected = event(socket, 'connect');
    socket.connect();
    await connected;
    const joined = event(socket, 'self::join');
    socket.emit('room::join', { room: 'runtimesmoke' });
    await joined;
    guests.push(socket);
    guestSessions.push({ browser: guest, token });
  }
  const message = event(guests[1], 'room::message');
  guests[0].emit('room::message', { message: 'runtime migration smoke' });
  assert.equal((await message).message, 'runtime migration smoke');
  console.log('PASS guest session reuse, Socket.IO room join, cross-process Redis adapter chat');

  const oldId = guests[0].id;
  const beforeRecovery = await Room.findOne({ name: 'runtimesmoke' }).lean();
  const originalMember = beforeRecovery.users.find(user => user.socket_id === oldId);
  assert.ok(originalMember);
  const userListId = String(originalMember._id);
  const firstPrivateMessage = event(guests[0], 'room::privateMessage');
  guests[1].emit('room::privateMessage', {
    room: 'runtimesmoke', userListId, message: 'before transport recovery',
  });
  assert.equal((await firstPrivateMessage).message, 'before transport recovery');
  await until(async () => await redis.get(userListId) === oldId, 'initial private-message target cache');

  // A transport failure preserves the session; a namespace disconnect is an intentional leave.
  const disconnected = event(guests[0], 'disconnect');
  guests[0].io.engine.transport.close();
  await disconnected;
  await until(async () => Number(await redis.hGet(oldId, 'reconnectUntil')) > Date.now(),
    'disconnected member recovery window');
  const replacement = io(`http://127.0.0.1:${web2Port}`, {
    auth: { token: guestSessions[0].token },
    extraHeaders: { Cookie: guestSessions[0].browser.cookie(), 'X-Forwarded-Proto': 'https' },
    transports: ['websocket'], autoConnect: false, reconnection: false,
  });
  sockets.push(replacement);
  const replacementConnected = event(replacement, 'connect');
  replacement.connect();
  await replacementConnected;
  const recoveryRoute = `/api/user/socket/old/${encodeURIComponent(oldId)}/new/${encodeURIComponent(replacement.id)}`;
  // The HTTP request reaches worker one; the authenticated replacement lives on worker two.
  response = await guestSessions[0].browser.request(recoveryRoute, {}, 'PUT');
  assert.equal(response.status, 200, 'Cross-worker session recovery');
  const afterRecovery = await Room.findOne({ name: 'runtimesmoke' }).lean();
  assert.equal(afterRecovery.users.length, beforeRecovery.users.length);
  const recoveredMember = afterRecovery.users.find(user => String(user._id) === userListId);
  assert.equal(recoveredMember?.socket_id, replacement.id);
  assert.equal(recoveredMember.session_id, originalMember.session_id);
  assert.equal(await redis.exists(oldId), 0);
  const recoveredCache = await redis.hGetAll(replacement.id);
  assert.equal(recoveredCache.userListId, userListId);
  assert.equal(recoveredCache.disconnected, 'false');
  assert.equal(recoveredCache.reconnectUntil, undefined);
  assert.ok(await redis.ttl(replacement.id) > 0);
  assert.equal(await redis.get(userListId), replacement.id);
  assert.ok(await redis.ttl(userListId) > 0);

  for (const [sender, recipient, text] of [
    [replacement, guests[1], 'recovered sender to room'],
    [guests[1], replacement, 'room to recovered recipient'],
  ]) {
    const delivered = event(recipient, 'room::message');
    const echoed = event(sender, 'room::message');
    sender.emit('room::message', { message: text });
    for (const received of await Promise.all([delivered, echoed])) assert.equal(received.message, text);
  }
  const recoveredPrivateMessage = event(replacement, 'room::privateMessage');
  guests[1].emit('room::privateMessage', {
    room: 'runtimesmoke', userListId, message: 'private message after recovery',
  });
  assert.equal((await recoveredPrivateMessage).message, 'private message after recovery');
  response = await guestSessions[0].browser.request(recoveryRoute, {}, 'PUT');
  assert.equal(response.status, 200, 'Recovery retry after the original response was lost');
  console.log('PASS cross-worker Socket.IO transport recovery: stable member/session, Redis hash/TTL migration, two-way chat, private-message delivery and retry');

  const limiter = browser(`http://127.0.0.1:${web2Port}`);
  // Invalid ordinary form submissions exercise the bounded limit without account side effects.
  for (let count = 0; count < 11; count += 1) {
    response = await limiter.request('/api/user/login', {});
  }
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('retry-after'));
  console.log('PASS rate-limit-redis 6 counters and retry-after response');

  if (args.includes('--browser-check')) {
    const done = path.join(temporary, 'browser.done');
    console.log(`BROWSER_CHECK ${JSON.stringify({ web: `http://127.0.0.1:${webPort}`,
      homepage: `http://127.0.0.1:${homePort}`, done })}`);
    // Optional bounded window for a second process to inspect the built browser UI.
    for (let count = 0; count < 300 && !interrupted; count += 1) {
      if (await access(done).then(() => true, () => false)) break;
      await delay(1000);
    }
  }

  if (mongodump) {
    const dumpVersion = (await execute(mongodump, ['--version'])).stdout.split('\n')[0];
    const restoreVersion = (await execute(mongorestore, ['--version'])).stdout.split('\n')[0];
    assert.match(dumpVersion, /100\.18\.0/);
    assert.match(restoreVersion, /100\.18\.0/);
    // Stop every test application writer before taking the coordinated snapshot.
    sockets.forEach(socket => socket.disconnect());
    for (const { name, child } of children) {
      if (['web', 'web2', 'homepage'].includes(name)) await stop(child);
    }
    const sourceUploads = environment.UPLOAD_BASE_PATH;
    const imageFixtures = {
      'public/avatars/fixture.png': Buffer.from('synthetic public image fixture'),
      'private/age-verification/fixture.jpg': Buffer.from('synthetic private image fixture'),
    };
    for (const [key, content] of Object.entries(imageFixtures)) {
      await mkdir(path.dirname(path.join(sourceUploads, key)), { recursive: true });
      await writeFile(path.join(sourceUploads, key), content);
    }
    const backup = path.join(temporary, 'backup');
    await mkdir(backup, { mode: 0o700 });
    const archive = path.join(backup, 'database.archive.gz');
    const uploadsArchive = path.join(backup, 'uploads.tar.gz');
    await execute(mongodump, ['--uri', mongoUri, `--archive=${archive}`, '--gzip']);
    await execute('tar', ['-C', sourceUploads, '-czf', uploadsArchive, '.']);
    const sha256 = {};
    for (const file of ['database.archive.gz', 'uploads.tar.gz']) {
      sha256[file] = createHash('sha256').update(await readFile(path.join(backup, file))).digest('hex');
    }
    const fcv = (await mongo.db().admin().command({ getParameter: 1, featureCompatibilityVersion: 1 }))
      .featureCompatibilityVersion.version;
    await writeFile(path.join(backup, 'manifest.json'), JSON.stringify({
      format: 2, database: 'jic_runtime_test', storage_backend: 'local', sha256,
      mongodb: { version: serverVersion, fcv, database_tools: dumpVersion },
    }));
    await execute('python3', [path.join(root, 'scripts/backup.py'), 'verify', backup]);

    const restorePort = await port();
    const restoreDirectory = path.join(temporary, 'restore-db');
    await mkdir(restoreDirectory);
    start('mongodb-restore', mongod, ['--dbpath', restoreDirectory, '--port', String(restorePort),
      '--bind_ip', '127.0.0.1'], temporary);
    const restoreUri = `mongodb://127.0.0.1:${restorePort}/jic_restored_test?directConnection=true`;
    const restored = new MongoClient(restoreUri, { serverSelectionTimeoutMS: 500 });
    connections.push(() => restored.close());
    await until(async () => {
      await restored.connect();
      return restored.db().admin().command({ ping: 1 });
    }, 'fresh restore database');
    // The restore connection URI must not select a database before namespace mapping.
    await execute(mongorestore, ['--uri', `mongodb://127.0.0.1:${restorePort}/?directConnection=true`,
      `--archive=${archive}`, '--gzip', '--nsInclude=jic_runtime_test.*',
      '--nsFrom=jic_runtime_test.*', '--nsTo=jic_restored_test.*']);
    for (const collection of ['users', 'rooms', 'sessions']) {
      assert.equal(await restored.db().collection(collection).countDocuments(),
        await mongo.db().collection(collection).countDocuments(), `Restored ${collection} count`);
      assert.deepEqual(await restored.db().collection(collection).find().sort({ _id: 1 }).toArray(),
        await mongo.db().collection(collection).find().sort({ _id: 1 }).toArray());
      assert.deepEqual(await restored.db().collection(collection).indexes(),
        await mongo.db().collection(collection).indexes());
    }
    const account = await restored.db().collection('users').findOne({ username: 'runtimefixture' });
    assert.ok(await bcrypt.compare(password, account.auth.passhash));
    const restoredUploads = path.join(temporary, 'restored-uploads');
    await mkdir(restoredUploads);
    await execute('tar', ['-C', restoredUploads, '-xzf', uploadsArchive]);
    for (const [key, content] of Object.entries(imageFixtures)) {
      assert.deepEqual(await readFile(path.join(restoredUploads, key)), content);
    }
    console.log('PASS Database Tools 100.18 dump/restore: accounts, rooms, sessions, TTL/indexes, public/private uploads, manifest verification');
  }
} catch (error) {
  for (const { name, logPath } of children) {
    const log = await readFile(logPath, 'utf8').catch(() => '');
    console.error(`${name} log tail:\n${log.slice(-3500)}`);
  }
  throw error;
} finally {
  sockets.forEach(socket => socket.disconnect());
  await Promise.allSettled(connections.reverse().map(close => close()));
  for (const { child } of [...children].reverse()) {
    await stop(child);
  }
  children.forEach(({ output }) => output.end());
  await rm(temporary, { recursive: true, force: true });
}
