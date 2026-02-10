#!/usr/bin/env node
/**
 * Add .js extensions to ALL relative ESM imports that are missing them.
 * Handles: import x from './path', export { x } from './path', await import('./path')
 * Resolves directories to /index.js if they have one.
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

  // Match any relative path in import/export from or dynamic import
  // This regex captures the path between quotes that starts with . or ..
  content = content.replace(/(from\s+['"])(\.\.?\/[^'"]*?)(['"])/g, (match, prefix, importPath, suffix) => {
    return fixImportPath(match, prefix, importPath, suffix, fileDir);
  });

  content = content.replace(/(import\s*\(\s*['"])(\.\.?\/[^'"]*?)(['"]\s*\))/g, (match, prefix, importPath, suffix) => {
    return fixImportPath(match, prefix, importPath, suffix, fileDir);
  });

  function fixImportPath(match, prefix, importPath, suffix, fileDir) {
    // Already has a proper file extension
    const ext = extname(importPath);
    if (ext === '.js' || ext === '.json' || ext === '.mjs' || ext === '.cjs') {
      // But check for the /.js.js bug
      if (importPath.endsWith('/.js.js')) {
        changed = true;
        return prefix + importPath.replace(/\/\.js\.js$/, '/index.js') + suffix;
      }
      // Check if path.js is actually a directory
      if (ext === '.js') {
        const withoutExt = importPath.slice(0, -3);
        const dirPath = resolve(fileDir, withoutExt);
        if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
          if (existsSync(join(dirPath, 'index.js'))) {
            changed = true;
            return prefix + withoutExt + '/index.js' + suffix;
          }
        }
      }
      return match;
    }

    // No recognized extension - resolve it
    const resolvedPath = resolve(fileDir, importPath);

    // Check if it's a directory with index.js
    if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
      if (existsSync(join(resolvedPath, 'index.js'))) {
        changed = true;
        return prefix + importPath + '/index.js' + suffix;
      }
    }

    // Check if .js file exists
    if (existsSync(resolvedPath + '.js')) {
      changed = true;
      return prefix + importPath + '.js' + suffix;
    }

    // Default: add .js
    changed = true;
    return prefix + importPath + '.js' + suffix;
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
    }
  } catch (err) {
    console.error(`ERROR: ${relative(join(__dirname, '..'), file)}: ${err.message}`);
  }
}

console.log(`Fixed ${converted}/${files.length} files.`);
