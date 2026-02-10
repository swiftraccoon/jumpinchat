#!/usr/bin/env node
import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
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
let errors = 0;

for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`SYNTAX ERROR: ${relative('/app', f)}`);
    console.error(err.stderr.toString().trim());
    console.error('');
    errors++;
  }
}

console.log(`\nChecked ${files.length} files, ${errors} errors.`);
