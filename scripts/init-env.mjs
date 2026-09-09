#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  output: { type: 'string', default: fileURLToPath(new URL('../jumpinchat-deploy/.env', import.meta.url)) },
} });
let template = fs.readFileSync(new URL('../jumpinchat-deploy/example.env', import.meta.url), 'utf8');
for (const name of ['JWT_SECRET', 'COOKIE_SECRET', 'SHARED_SECRET', 'JANUS_TOKEN_SECRET', 'FILE_TOKEN_SECRET']) {
  template = template.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${crypto.randomBytes(32).toString('hex')}`);
}
try {
  fs.writeFileSync(values.output, template, { flag: 'wx', mode: 0o600 });
} catch (err) {
  if (err.code !== 'EEXIST') throw err;
  console.error('Environment file already exists; it was not overwritten.');
  process.exit(1);
}
console.log('Environment file created with unique secrets. Set JANUS_NAT_IP, then run preflight.');
