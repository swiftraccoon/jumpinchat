#!/usr/bin/env node
/**
 * Fix ESM imports that point to directories (need /index.js) or have wrong extensions.
 * In ESM, `import x from './dir'` does NOT automatically resolve to `./dir/index.js`.
 * This script detects and fixes those patterns.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, resolve, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srvDir = join(__dirname, '..', 'srv');

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

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  let changed = false;
  const fileDir = dirname(filePath);

  // Fix all relative import/export from paths
  const patterns = [
    /(import\s+[\s\S]*?\s+from\s+['"])(\.[^'"]+)(['"])/g,
    /(export\s+[\s\S]*?\s+from\s+['"])(\.[^'"]+)(['"])/g,
    /(await\s+import\s*\(\s*['"])(\.[^'"]+)(['"]\s*\))/g,
  ];

  for (const regex of patterns) {
    content = content.replace(regex, (match, prefix, importPath, suffix) => {
      const resolvedBase = resolve(fileDir, importPath);

      // Fix 1: path ends with /.js.js (double extension bug)
      if (importPath.endsWith('/.js.js')) {
        const fixed = importPath.replace(/\/\.js\.js$/, '/index.js');
        changed = true;
        return prefix + fixed + suffix;
      }

      // Fix 2: path ends with /.js (malformed - should be /index.js)
      if (importPath.endsWith('/.js')) {
        const fixed = importPath.replace(/\/\.js$/, '/index.js');
        changed = true;
        return prefix + fixed + suffix;
      }

      // Fix 3: path.js but path is actually a directory with index.js
      if (importPath.endsWith('.js')) {
        const withoutExt = importPath.slice(0, -3);
        const dirPath = resolve(fileDir, withoutExt);
        if (existsSync(dirPath) && statSync(dirPath).isDirectory() && existsSync(join(dirPath, 'index.js'))) {
          const fixed = withoutExt + '/index.js';
          changed = true;
          return prefix + fixed + suffix;
        }
      }

      // Fix 4: no extension at all - check if it's a directory or file
      if (!extname(importPath)) {
        const asDir = resolvedBase;
        const asFile = resolvedBase + '.js';

        if (existsSync(asDir) && statSync(asDir).isDirectory() && existsSync(join(asDir, 'index.js'))) {
          changed = true;
          return prefix + importPath + '/index.js' + suffix;
        }
        if (existsSync(asFile)) {
          changed = true;
          return prefix + importPath + '.js' + suffix;
        }
      }

      return match;
    });
  }

  if (changed) {
    writeFileSync(filePath, content);
    return true;
  }
  return false;
}

// Main
const files = collectFiles(srvDir);
let converted = 0;

for (const file of files) {
  try {
    if (fixFile(file)) {
      converted++;
      console.log(`Fixed: ${relative(join(__dirname, '..'), file)}`);
    }
  } catch (err) {
    console.error(`ERROR: ${relative(join(__dirname, '..'), file)}: ${err.message}`);
  }
}

console.log(`\nFixed ${converted}/${files.length} files.`);
