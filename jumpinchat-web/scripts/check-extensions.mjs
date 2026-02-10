#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      collectFiles(full, files);
    } else if (entry.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const files = collectFiles('/app/srv');
let issues = 0;
const importRe = /(?:from\s+['"]|import\s*\(\s*['"])(\.\.?\/[^'"]+?)(['"])/g;

for (const f of files) {
  const content = readFileSync(f, 'utf8');
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const p = m[1];
    if (!p.endsWith('.js') && !p.endsWith('.json') && !p.endsWith('.mjs') && !p.endsWith('.cjs')) {
      console.log(relative('/app', f) + ': ' + m[0]);
      issues++;
    }
  }
}
console.log('\nTotal missing extensions: ' + issues);
