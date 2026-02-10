#!/usr/bin/env node
/**
 * Fix esmock mock paths — they must be relative to the test file, not the module under test.
 *
 * In proxyquire: mock paths were relative to the MODULE under test.
 * In esmock: mock paths are relative to the TEST file (the file calling esmock).
 *
 * This script:
 * 1. Finds all esmock() calls in test files
 * 2. For each call, finds the module under test (first arg)
 * 3. For each mock key (relative path), re-resolves it from the module dir to an absolute path,
 *    then recalculates the relative path from the test file's directory.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, resolve, extname, posix } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srvDir = join(__dirname, '..', 'srv');

function collectSpecFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      collectSpecFiles(full, files);
    } else if (entry.endsWith('.spec.js')) {
      files.push(full);
    }
  }
  return files;
}

function resolveModulePath(importPath, fromDir) {
  if (!importPath.startsWith('.')) return null; // npm package, skip

  const resolved = resolve(fromDir, importPath);

  // Check all possible resolutions
  if (existsSync(resolved)) {
    if (statSync(resolved).isDirectory()) {
      if (existsSync(join(resolved, 'index.js'))) {
        return join(resolved, 'index.js');
      }
    }
    return resolved;
  }

  if (existsSync(resolved + '.js')) return resolved + '.js';

  // Try without .js extension if path ends with .js
  if (resolved.endsWith('.js') && existsSync(resolved)) return resolved;

  return resolved; // best guess
}

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  let changed = false;
  const testDir = dirname(filePath);

  // Find all esmock calls and extract the module path (first arg)
  // Pattern: await esmock('../../controllers/room.changeChatColor.js', {
  //   '../room.utils.js': ...
  // })

  // For each esmock call, find the first arg (module path) and all mock keys
  const esmockRe = /await\s+esmock\(\s*(['"])([^'"]+)\1\s*,\s*\{/g;
  let match;

  while ((match = esmockRe.exec(content)) !== null) {
    const quote = match[1];
    const modulePath = match[2];

    if (!modulePath.startsWith('.')) continue;

    // Resolve the module under test to absolute path
    const moduleAbsPath = resolve(testDir, modulePath);
    const moduleDir = dirname(moduleAbsPath);

    // Find all mock keys in the object literal following the opening brace
    // We need to find relative path keys and fix them
    const braceStart = match.index + match[0].length;

    // Simple approach: scan for quoted relative paths followed by ':'
    // within a reasonable distance from the esmock call
    const searchRegion = content.slice(braceStart, braceStart + 3000);

    const mockKeyRe = /(['"])(\.\.?\/[^'"]+?)\1\s*:/g;
    let keyMatch;

    while ((keyMatch = mockKeyRe.exec(searchRegion)) !== null) {
      const keyQuote = keyMatch[1];
      const mockPath = keyMatch[2];

      // Resolve the mock path as proxyquire would (relative to module under test)
      const absoluteMockPath = resolveModulePath(mockPath, moduleDir);
      if (!absoluteMockPath) continue;

      // Calculate what the path should be from the test file's directory
      let newMockPath = relative(testDir, absoluteMockPath);

      // Ensure it starts with ./
      if (!newMockPath.startsWith('.')) {
        newMockPath = './' + newMockPath;
      }

      // Convert backslashes to forward slashes (for Windows compat)
      newMockPath = newMockPath.replace(/\\/g, '/');

      if (newMockPath !== mockPath) {
        // Replace in the search region
        const oldKey = `${keyQuote}${mockPath}${keyQuote}`;
        const newKey = `${keyQuote}${newMockPath}${keyQuote}`;

        const absolutePos = braceStart + keyMatch.index;
        const before = content.slice(0, absolutePos);
        const after = content.slice(absolutePos + oldKey.length);

        if (content.slice(absolutePos, absolutePos + oldKey.length) === oldKey) {
          content = before + newKey + after;
          changed = true;
          // Reset regex since content changed
          esmockRe.lastIndex = absolutePos + newKey.length + 10;
          break; // re-start outer loop from new position
        }
      }
    }
  }

  if (changed) {
    writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = collectSpecFiles(srvDir);
let totalFixed = 0;

// Run multiple passes since fixing one path changes positions
for (let pass = 0; pass < 5; pass++) {
  let fixedThisPass = 0;
  for (const file of files) {
    try {
      if (fixFile(file)) {
        fixedThisPass++;
        console.log(`Fixed (pass ${pass + 1}): ${relative(join(__dirname, '..'), file)}`);
      }
    } catch (err) {
      console.error(`ERROR: ${relative(join(__dirname, '..'), file)}: ${err.message}`);
    }
  }

  if (fixedThisPass === 0) break;
  totalFixed += fixedThisPass;
}

console.log(`\nTotal fixed: ${totalFixed} files across multiple passes.`);
