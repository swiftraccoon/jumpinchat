#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { parseArgs } from 'node:util';
import { validateEnv } from '../jumpinchat-web/srv/config/validateEnv.js';

const deploy = fileURLToPath(new URL('../jumpinchat-deploy/', import.meta.url));
const { values } = parseArgs({ options: {
  'env-file': { type: 'string', default: path.join(deploy, '.env') },
  profile: { type: 'string', default: 'full' },
} });
const profiles = ['full', 'lite', 'app', 'media', 'data', 'email'];
if (!profiles.includes(values.profile)) throw new Error(`Profile must be one of: ${profiles.join(', ')}`);
try {
  process.loadEnvFile(values['env-file']);
} catch {
  console.error('Cannot read environment file. Create it with node scripts/init-env.mjs first.');
  process.exit(1);
}
const env = process.env;
const failures = [];
const app = ['full', 'lite', 'app'].includes(values.profile);
const media = ['full', 'lite', 'media'].includes(values.profile);
if (app || media || values.profile === 'email') {
  try {
    // Compose supplies the default internal database/cache URLs.
    validateEnv('production', {
      ...env,
      MONGODB_URI: env.MONGODB_URI || 'mongodb://mongodb/tc?replicaSet=rs0',
      REDIS_URI: env.REDIS_URI || 'redis://redis:6379',
    });
  } catch (err) {
    const required = app ? null : media ? ['JANUS_TOKEN_SECRET'] : ['SHARED_SECRET'];
    const lines = err.message.split('\n').slice(1);
    failures.push(...lines.filter(line => !required || required.some(name => line.includes(name)))
      .map(line => line.trim().replace(/^- /, '')));
  }
}
if (media && (!isIP(env.JANUS_NAT_IP || '') || env.JANUS_NAT_IP.startsWith('127.')
  || env.JANUS_NAT_IP === '::1')) failures.push('JANUS_NAT_IP must be a non-loopback LAN or public IP');
if (app && !['local', 's3'].includes(env.STORAGE_BACKEND || 'local')) {
  failures.push('STORAGE_BACKEND must be local or s3');
}
if (app && env.STORAGE_BACKEND === 's3') {
  for (const name of ['S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET']) {
    if (!env[name]) failures.push(`${name} is required for S3 storage`);
  }
  const origin = env.S3_PUBLIC_BASE_URL || '';
  if (origin.includes('/../') || origin.includes('/./') || !/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?\/(?:[a-zA-Z0-9_.-]+\/)*public\/$/.test(origin)) {
    failures.push('S3_PUBLIC_BASE_URL must be an HTTPS URL ending in /public/ with no credentials, query, or fragment');
  }
}
if (app || media) {
  for (const file of ['fullchain.pem', 'privkey.pem', ...(app ? ['nginx/dhparam.pem'] : [])]) {
    if (!fs.existsSync(path.join(deploy, file))) failures.push(`Missing TLS file: jumpinchat-deploy/${file}`);
  }
}
if (failures.length) {
  console.error(`Preflight failed:\n${failures.map(line => `  - ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`Preflight passed for ${values.profile}; no secrets printed.`);
