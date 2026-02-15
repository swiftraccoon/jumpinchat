import esbuild from 'esbuild';
import * as sass from 'sass';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const outdir = 'public';

// Ensure output directories exist
fs.mkdirSync(path.join(outdir, 'js'), { recursive: true });
fs.mkdirSync(path.join(outdir, 'styles'), { recursive: true });

// Build JS
console.log('Building JS...');
await esbuild.build({
  entryPoints: ['src/js/app.js'],
  bundle: true,
  minify: true,
  sourcemap: true,
  outdir: path.join(outdir, 'js'),
  format: 'esm',
  target: 'es2020',
});

// Build SCSS
console.log('Building CSS...');
const cssResult = sass.compile('src/styles/site.scss', { style: 'compressed' });
fs.writeFileSync(path.join(outdir, 'styles', 'site.css'), cssResult.css);

// Copy images
console.log('Copying images...');
fs.cpSync('src/images', path.join(outdir, 'images'), { recursive: true });

// Generate rev-manifest with content hashes
function hashFile(filepath) {
  const content = fs.readFileSync(filepath);
  return createHash('md5').update(content).digest('hex').slice(0, 10);
}

const manifest = {};
for (const file of ['styles/site.css', 'js/app.js']) {
  const fullPath = path.join(outdir, file);
  if (fs.existsSync(fullPath)) {
    const hash = hashFile(fullPath);
    const ext = path.extname(file);
    const base = file.slice(0, -ext.length);
    const revName = `${base}-${hash}${ext}`;
    const revPath = path.join(outdir, revName);
    fs.copyFileSync(fullPath, revPath);
    manifest[file] = revName;
  }
}

fs.writeFileSync(path.join(outdir, 'rev-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Build complete:', manifest);
