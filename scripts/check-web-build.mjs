import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Check the published files themselves after a build, without rebuilding or
// depending on the compiler's internal asset list.
const webRoot = fileURLToPath(new URL('../jumpinchat-web/', import.meta.url));
const mode = process.argv[2] || 'dist';
assert(['dist', '.tmp'].includes(mode), 'Usage: node scripts/check-web-build.mjs [dist|.tmp]');
const output = path.join(webRoot, mode);
const template = await fs.readFile(path.join(output, 'index.ejs'), 'utf8');
const manifest = JSON.parse(await fs.readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
const checked = new Set();
async function exists(relative) {
  const filename = path.resolve(output, relative.replace(/^\//, ''));
  assert(filename.startsWith(`${output}${path.sep}`), `Asset leaves build directory: ${relative}`);
  assert((await fs.stat(filename)).isFile(), `Missing built file: ${relative}`);
  checked.add(filename);
}

for (const [, reference] of template.matchAll(/(?:src|href)="(\/[^"<>]+)"/g)) {
  await exists(reference);
}
assert.match(template, /<script nomodule src="\/js\/vendors[^" ]*\.js"/);
assert.match(template, /<script type="module" src="\/js\/bundle[^" ]*\.mjs"/);

for (const [original, revised] of Object.entries(manifest)) {
  await exists(revised);
  assert(template.includes(`/${revised}`), `Template omits ${revised}`);
  if (mode === 'dist') {
    assert.match(revised, /\.[a-f0-9]{12}\.(?:m?js|css)$/, `Unhashed production entry: ${revised}`);
    await exists(`${revised}.map`);
    const map = JSON.parse(await fs.readFile(path.join(output, `${revised}.map`), 'utf8'));
    assert.equal(map.version, 3);
    assert(map.sources.length > 0, `Empty source map for ${revised}`);
  } else assert.equal(revised, original, 'Development entry must keep a stable URL');
}

for (const relative of ['fontawesome/css/all.min.css', 'fontawesome/css/v4-shims.min.css', manifest['styles/main.css']]) {
  const css = await fs.readFile(path.join(output, relative), 'utf8');
  for (const [, raw] of css.matchAll(/url\(([^)]+)\)/g)) {
    const reference = raw.replace(/^['"]|['"]$/g, '').split(/[?#]/)[0];
    if (!reference || /^(?:data:|https?:|\/\/)/.test(reference)) continue;
    await exists(reference.startsWith('/') ? reference : path.join(path.dirname(relative), reference));
  }
}

const worker = await fs.readFile(path.join(output, 'service-worker.js'), 'utf8');
let precache = [];
let claimsClients = false;
let skipsWaiting = false;
const importedScripts = [];
const workbox = {
  setCacheNameDetails() {}, cleanupOutdatedCaches() {},
  precacheAndRoute(entries) { precache = entries; },
  clientsClaim() { claimsClients = true; },
  NetworkOnly: class NetworkOnly {},
  registerRoute(_match, handler) { assert(handler instanceof this.NetworkOnly, 'Development requests must use the network'); },
};
vm.runInNewContext(worker, {
  self: { define() {}, addEventListener() {}, skipWaiting() { skipsWaiting = true; } },
  importScripts(...scripts) { importedScripts.push(...scripts); },
  define(_dependencies, factory) { factory(workbox); },
}, { timeout: 1000 });
assert(importedScripts.includes('/js/push-manager.js'), 'Push notification worker was not retained');
await exists('js/push-manager.js');
for (const entry of precache) {
  assert(!/(?:\.ejs$|\.map$|^api\/|^version\.js$)/.test(entry.url), `Non-static or deployment-generated precache entry: ${entry.url}`);
  await exists(entry.url);
}
if (mode === 'dist') {
  for (const revised of Object.values(manifest)) assert(precache.some(entry => entry.url === revised), `${revised} is not precached`);
} else {
  assert.equal(precache.length, 0, 'Development rebuilds must use network assets');
  assert(claimsClients && skipsWaiting, 'Development worker must replace stale cached builds');
}
const version = {};
vm.runInNewContext(await fs.readFile(path.join(output, 'version.js'), 'utf8'), { window: version }, { timeout: 1000 });
assert.equal(typeof version.BUILD_NUM, 'string');
assert(version.BUILD_NUM.length > 0);
console.log(`Verified ${mode}: ${checked.size} static files, ${Object.keys(manifest).length} entry mappings and ${precache.length} precache entries.`);
