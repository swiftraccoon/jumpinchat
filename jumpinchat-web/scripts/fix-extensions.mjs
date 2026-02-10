#!/usr/bin/env node
/**
 * Fix missing .js extensions on relative ESM imports.
 * In ESM, relative imports MUST include the file extension.
 * Also fixes malformed paths like './foo/.js' → './foo/index.js'
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

  // Fix import/export from statements with relative paths
  const importRegex = /(import\s+.*?\s+from\s+['"])(\.[^'"]+)(['"];?)/g;
  // Also handle: export { ... } from '...'
  const exportFromRegex = /(export\s+.*?\s+from\s+['"])(\.[^'"]+)(['"];?)/g;
  // Also handle: await import('...')
  const dynamicImportRegex = /(await\s+import\s*\(\s*['"])(\.[^'"]+)(['"]\s*\))/g;

  function fixPath(match, prefix, importPath, suffix) {
    // Already has an extension like .js, .json, .mjs
    if (extname(importPath) && extname(importPath) !== '.') {
      // Fix malformed paths like './foo/.js' → './foo/index.js'
      if (importPath.endsWith('/.js')) {
        changed = true;
        return prefix + importPath.replace(/\/\.js$/, '/index.js') + suffix;
      }
      return match;
    }

    // Check if the path points to a directory with index.js
    const resolvedPath = resolve(fileDir, importPath);
    if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
      if (existsSync(join(resolvedPath, 'index.js'))) {
        changed = true;
        return prefix + importPath + '/index.js' + suffix;
      }
    }

    // Check if file.js exists
    if (existsSync(resolvedPath + '.js')) {
      changed = true;
      return prefix + importPath + '.js' + suffix;
    }

    // If the path already ends with no extension and we can't resolve it,
    // try adding .js anyway (it might be built/installed later)
    changed = true;
    return prefix + importPath + '.js' + suffix;
  }

  content = content.replace(importRegex, fixPath);
  content = content.replace(exportFromRegex, fixPath);
  content = content.replace(dynamicImportRegex, fixPath);

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
