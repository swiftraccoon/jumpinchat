import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import webpack from 'webpack';
import * as sass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import { generateSW } from 'workbox-build';
import webpackConfig from './webpack.conf.cjs';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const watching = process.argv.includes('--watch');
const production = !watching;
process.env.NODE_ENV = production ? 'production' : 'development';
const outputPath = path.join(root, production ? 'dist' : '.tmp');
const source = path.join(root, 'react-client');

function bundle(esNext) {
  const compiler = webpack(webpackConfig({ esNext, production, outputPath }));
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => compiler.close(closeError => {
      if (err || closeError) return reject(err || closeError);
      const result = stats.toJson({ all: false, assets: true, errors: true, warnings: true });
      if (stats.hasErrors()) return reject(new Error(result.errors.map(item => item.message).join('\n')));
      for (const warning of result.warnings) console.warn(warning.message);
      resolve(result.assets.map(asset => asset.name));
    }));
  });
}

async function styles() {
  const compiled = await sass.compileAsync(path.join(source, 'styles/main.scss'), {
    style: production ? 'compressed' : 'expanded', sourceMap: true,
  });
  const result = await postcss([autoprefixer()]).process(compiled.css, {
    from: path.join(source, 'styles/main.scss'), to: path.join(outputPath, 'styles/main.css'),
    map: { prev: compiled.sourceMap, inline: false, annotation: false },
  });
  const hash = createHash('sha256').update(result.css).digest('hex').slice(0, 12);
  const name = production ? `main.${hash}.css` : 'main.css';
  await fs.mkdir(path.join(outputPath, 'styles'), { recursive: true });
  await fs.writeFile(path.join(outputPath, 'styles', name), result.css);
  if (result.map) await fs.writeFile(path.join(outputPath, 'styles', `${name}.map`), result.map.toString());
  return name;
}

async function build() {
  const started = Date.now();
  await fs.rm(outputPath, { recursive: true, force: true });
  await fs.mkdir(outputPath, { recursive: true });
  const [classic, modules, stylesheet] = await Promise.all([
    bundle(false), bundle(true), styles(),
    ...['img', 'sounds'].map(dir => fs.cp(path.join(source, dir), path.join(outputPath, dir), { recursive: true })),
    ...['css', 'webfonts'].map(dir => fs.cp(path.join(root, 'node_modules/@fortawesome/fontawesome-free', dir),
      path.join(outputPath, 'fontawesome', dir), { recursive: true })),
  ]);
  const manifest = { 'styles/main.css': `styles/${stylesheet}` };
  for (const asset of [...classic, ...modules]) {
    if (!/\.(m?js)$/.test(asset)) continue;
    manifest[`js/${asset.replace(/\.[a-f0-9]{12}(?=\.m?js$)/, '')}`] = `js/${asset}`;
  }
  let template = await fs.readFile(path.join(source, 'index.ejs'), 'utf8');
  template = template.replace(/<!--\s*(?:build:.*?|endbuild)\s*-->/g, '');
  for (const [original, revised] of Object.entries(manifest)) template = template.replaceAll(`/${original}`, `/${revised}`);
  await fs.writeFile(path.join(outputPath, 'index.ejs'), template);
  await fs.writeFile(path.join(outputPath, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.cp(path.join(source, 'sw'), path.join(outputPath, 'js'), { recursive: true });
  // Cache only public static assets. Session-dependent HTML and APIs must stay on the network.
  const { count, warnings } = await generateSW({
    cacheId: 'jumpinchat', swDest: path.join(outputPath, 'service-worker.js'),
    globDirectory: outputPath,
    globPatterns: ['img/**/*', 'sounds/*.{mp3,ogg}', '**/*.{js,mjs,css,woff2}'],
    globIgnores: ['js/push-manager.js', '**/*.map'],
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    importScripts: ['/js/push-manager.js'],
    cleanupOutdatedCaches: true,
  });
  for (const warning of warnings) console.warn(warning);
  console.log(`Built ${production ? 'production' : 'development'} assets in ${((Date.now() - started) / 1000).toFixed(1)}s; precached ${count} files.`);
}

await build();
if (watching) {
  let timer;
  let running = false;
  let pending = false;
  async function rebuild() {
    if (running) { pending = true; return; }
    running = true;
    try { await build(); } catch (err) { console.error(err); }
    running = false;
    if (pending) { pending = false; await rebuild(); }
  }
  const watcher = watch(source, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    watcher.close(); clearTimeout(timer); process.exit(0);
  });
  console.log('Watching react-client for changes.');
}
