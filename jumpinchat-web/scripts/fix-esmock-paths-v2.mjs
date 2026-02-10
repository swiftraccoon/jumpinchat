#!/usr/bin/env node
/**
 * Fix esmock mock paths — they must be relative to the TEST FILE.
 *
 * In proxyquire: mock paths were relative to the MODULE under test.
 * In esmock: mock paths are relative to the TEST FILE.
 *
 * Approach:
 * 1. Find each esmock() call
 * 2. Get the module under test path (first arg) - relative to test file
 * 3. Calculate the module's directory (relative to test file)
 * 4. For each mock key that's a relative path:
 *    - Resolve it from the module's directory to absolute
 *    - Re-calculate it relative to the test file's directory
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';
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

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const testDir = dirname(filePath);
  let changed = false;

  // Find all esmock() calls
  // Pattern: await esmock('path/to/module.js', {
  const esmockCallRe = /await\s+esmock\(\s*(['"])([^'"]+)\1\s*,\s*\{/g;

  // Collect all esmock call positions and their module paths
  const calls = [];
  let m;
  while ((m = esmockCallRe.exec(content)) !== null) {
    const modulePath = m[2];
    if (!modulePath.startsWith('.')) continue;

    // Module's directory, resolved from the test file
    const moduleAbsDir = dirname(resolve(testDir, modulePath));

    calls.push({
      moduleAbsDir,
      braceStart: m.index + m[0].length,
    });
  }

  // Process calls in reverse order to avoid offset issues
  for (let i = calls.length - 1; i >= 0; i--) {
    const { moduleAbsDir, braceStart } = calls[i];

    // Find matching closing brace - simple depth tracking
    let depth = 1;
    let pos = braceStart;
    while (depth > 0 && pos < content.length) {
      if (content[pos] === '{') depth++;
      if (content[pos] === '}') depth--;
      if (depth > 0) pos++;
    }

    // Extract the mock object region
    const region = content.slice(braceStart, pos);

    // Find all relative path keys in the mock object
    let newRegion = region;
    const mockKeyRe = /(['"])(\.\.?\/[^'"]+?)\1(\s*:)/g;
    let km;
    const replacements = [];

    while ((km = mockKeyRe.exec(region)) !== null) {
      const quote = km[1];
      const mockPath = km[2];
      const colon = km[3];

      // Resolve the mock path from the MODULE's directory (as proxyquire would)
      const absoluteMockPath = resolve(moduleAbsDir, mockPath);

      // Calculate what it should be from the TEST FILE's directory
      let newMockPath = relative(testDir, absoluteMockPath);
      if (!newMockPath.startsWith('.')) {
        newMockPath = './' + newMockPath;
      }
      newMockPath = newMockPath.replace(/\\/g, '/');

      if (newMockPath !== mockPath) {
        replacements.push({
          start: km.index,
          end: km.index + km[0].length,
          old: `${quote}${mockPath}${quote}${colon}`,
          new: `${quote}${newMockPath}${quote}${colon}`,
        });
      }
    }

    // Apply replacements in reverse order within this region
    for (let j = replacements.length - 1; j >= 0; j--) {
      const r = replacements[j];
      newRegion = newRegion.slice(0, r.start) + r.new + newRegion.slice(r.end);
      changed = true;
    }

    if (newRegion !== region) {
      content = content.slice(0, braceStart) + newRegion + content.slice(pos);
    }
  }

  if (changed) {
    writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = collectSpecFiles(srvDir);
let fixed = 0;

for (const file of files) {
  try {
    if (fixFile(file)) {
      fixed++;
      console.log(`Fixed: ${relative(join(__dirname, '..'), file)}`);
    }
  } catch (err) {
    console.error(`ERROR: ${relative(join(__dirname, '..'), file)}: ${err.message}`);
  }
}

console.log(`\nFixed ${fixed} files.`);
