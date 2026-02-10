#!/usr/bin/env node
/**
 * Fix test files where 'await esmock(...)' appears inside non-async functions.
 *
 * Patterns to fix:
 * 1. Named functions: function getController() { ... await esmock ... }
 *    → async function getController() { ... await esmock ... }
 * 2. Arrow functions assigned to const/let: const fn = () => { ... await ... }
 *    → const fn = async () => { ... await ... }
 * 3. Callback functions: describe('...', () => { ... await ... })
 *    Don't add async to describe/it callbacks as mocha handles them differently
 * 4. beforeEach/before/afterEach/after already handled
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
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
  let changed = false;

  // Pattern 1: const getController = () => { return await esmock... }
  // → const getController = async () => { return await esmock... }
  const newContent = content.replace(
    /(const\s+\w+\s*=\s*)\(([^)]*)\)\s*=>\s*\{/g,
    (match, prefix, args) => {
      // Check if the function body contains 'await' by finding the matching closing brace
      const startIdx = content.indexOf(match);
      const bodyStart = startIdx + match.length;
      // Simple heuristic: check the next ~500 chars for 'await'
      const snippet = content.slice(bodyStart, bodyStart + 1000);
      if (snippet.includes('await esmock')) {
        if (!match.includes('async')) {
          changed = true;
          return `${prefix}async (${args}) => {`;
        }
      }
      return match;
    }
  );

  if (newContent !== content) {
    content = newContent;
  }

  // Pattern 2: function funcName(...) { ... await esmock ... }
  // → async function funcName(...) { ... await esmock ... }
  const newContent2 = content.replace(
    /^(\s*)(function\s+\w+\s*\([^)]*\)\s*\{)/gm,
    (match, indent, funcDecl) => {
      const startIdx = content.indexOf(match);
      const bodyStart = startIdx + match.length;
      const snippet = content.slice(bodyStart, bodyStart + 1000);
      if (snippet.includes('await esmock') && !funcDecl.startsWith('async')) {
        changed = true;
        return `${indent}async ${funcDecl}`;
      }
      return match;
    }
  );

  if (newContent2 !== content) {
    content = newContent2;
  }

  // Pattern 3: beforeEach(function() { or beforeEach(() => {
  // that contain await but aren't async yet
  content = content.replace(
    /beforeEach\(\s*\(\s*\)\s*=>\s*\{/g,
    (match) => {
      if (!match.includes('async')) {
        const startIdx = content.indexOf(match);
        const bodyStart = startIdx + match.length;
        const snippet = content.slice(bodyStart, bodyStart + 2000);
        if (snippet.includes('await esmock')) {
          changed = true;
          return 'beforeEach(async () => {';
        }
      }
      return match;
    }
  );

  // Pattern 4: it('...', () => { or it('...', function() { that contain await
  content = content.replace(
    /it\((['"][^'"]*['"]),\s*\(\s*\)\s*=>\s*\{/g,
    (match, desc) => {
      const startIdx = content.indexOf(match);
      const bodyStart = startIdx + match.length;
      const snippet = content.slice(bodyStart, bodyStart + 2000);
      if (snippet.includes('await esmock') && !match.includes('async')) {
        changed = true;
        return `it(${desc}, async () => {`;
      }
      return match;
    }
  );

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

console.log(`\nFixed ${fixed}/${files.length} test files.`);
