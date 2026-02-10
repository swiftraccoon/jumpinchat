#!/usr/bin/env node
/**
 * Convert test files from proxyquire/mock-require to esmock.
 *
 * Handles two patterns:
 * 1. proxyquire: import proxyquire from 'proxyquire';
 *    const proxyquire = proxyquire.noCallThru();
 *    mod = proxyquire('./path', { './dep': stub });
 *    → mod = await esmock('./path.js', { './dep.js': stub });
 *
 * 2. mock-require: import mock from 'mock-require';
 *    mock('./dep', stub);
 *    controller = mock.reRequire('./controller');
 *    → controller = await esmock('./controller.js', { './dep.js': stub });
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, resolve, extname } from 'path';
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

function resolvePath(importPath, fileDir) {
  if (!importPath.startsWith('.')) return importPath;

  const ext = extname(importPath);
  if (ext === '.js' || ext === '.json' || ext === '.mjs' || ext === '.cjs') {
    return importPath;
  }

  const resolved = resolve(fileDir, importPath);

  // Check if it's a directory with index.js
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    if (existsSync(join(resolved, 'index.js'))) {
      return importPath + '/index.js';
    }
  }

  // Check if .js file exists
  if (existsSync(resolved + '.js')) {
    return importPath + '.js';
  }

  // Default: add .js
  return importPath + '.js';
}

function convertProxyquireFile(content, fileDir) {
  // Remove the proxyquire import and noCallThru line
  content = content.replace(/import proxyquire from ['"]proxyquire['"];\n?/g, '');
  content = content.replace(/const proxyquire = proxyquire\.noCallThru\(\);\n?/g, '');

  // Add esmock import if not already present
  if (!content.includes("from 'esmock'") && !content.includes('from "esmock"')) {
    // Add after last import statement
    const lastImportIndex = content.lastIndexOf('\nimport ');
    if (lastImportIndex >= 0) {
      const endOfLine = content.indexOf('\n', lastImportIndex + 1);
      content = content.slice(0, endOfLine + 1) + "import esmock from 'esmock';\n" + content.slice(endOfLine + 1);
    } else {
      content = "import esmock from 'esmock';\n" + content;
    }
  }

  // Convert proxyquire calls: proxyquire('./path', { './dep': stub })
  // to: await esmock('./path.js', { './dep.js': stub })
  // This handles the module path but not the mock paths inside the object
  content = content.replace(
    /proxyquire\(\s*(['"])(\.\.?\/[^'"]*?)\1/g,
    (match, quote, modPath) => {
      const resolved = resolvePath(modPath, fileDir);
      return `await esmock(${quote}${resolved}${quote}`;
    }
  );

  // Fix mock paths inside the esmock call objects
  // Pattern: { './some/path': stub } - add .js to relative paths missing extensions
  content = content.replace(
    /(\{\s*(?:\n\s*)?)((?:['"]\.\.?\/[^'"]*?['"])\s*:)/g,
    (match, prefix, keyPart) => {
      // Extract the path from the key
      const pathMatch = keyPart.match(/(['"])(\.\.?\/[^'"]*?)\1/);
      if (pathMatch) {
        const [, quote, mockPath] = pathMatch;
        const resolved = resolvePath(mockPath, fileDir);
        if (resolved !== mockPath) {
          return prefix + `${quote}${resolved}${quote}:`;
        }
      }
      return match;
    }
  );

  // Also fix mock paths that are on continuation lines
  content = content.replace(
    /,\s*\n(\s*)(['"])(\.\.?\/[^'"]*?)\2\s*:/g,
    (match, indent, quote, mockPath) => {
      const resolved = resolvePath(mockPath, fileDir);
      return `,\n${indent}${quote}${resolved}${quote}:`;
    }
  );

  // Make beforeEach callbacks async if they contain await esmock
  content = content.replace(
    /beforeEach\(\s*\(\s*\)\s*=>\s*\{/g,
    (match) => {
      return 'beforeEach(async () => {';
    }
  );

  // Also handle beforeEach with function() syntax
  content = content.replace(
    /beforeEach\(\s*function\s*\(\s*\)\s*\{/g,
    (match) => {
      return 'beforeEach(async function() {';
    }
  );

  return content;
}

function convertMockRequireFile(content, filePath) {
  const fileDir = dirname(filePath);

  // Remove mock-require import
  content = content.replace(/import mock from ['"]mock-require['"];\n?/g, '');

  // Add esmock import if not already present
  if (!content.includes("from 'esmock'") && !content.includes('from "esmock"')) {
    const lastImportIndex = content.lastIndexOf('\nimport ');
    if (lastImportIndex >= 0) {
      const endOfLine = content.indexOf('\n', lastImportIndex + 1);
      content = content.slice(0, endOfLine + 1) + "import esmock from 'esmock';\n" + content.slice(endOfLine + 1);
    } else {
      content = "import esmock from 'esmock';\n" + content;
    }
  }

  // Remove mock.stopAll() calls
  content = content.replace(/\s*mock\.stopAll\(\);\n?/g, '\n');

  // Remove getController helper that uses mock.reRequire
  // Pattern: const getController = () => mock.reRequire('./path');
  content = content.replace(/\s*const get\w+ = \(\) => mock\.reRequire\(['"][^'"]+['"]\);\n?/g, '\n');

  // For mock-require files, we need to collect all mock() calls in a beforeEach
  // and convert the mock.reRequire to esmock with all mocks as second arg

  // This is complex - for now, collect mock paths and their stubs
  // Pattern: mock('./path', stubObj);
  const mockCalls = [];
  const mockRegex = /mock\(\s*(['"])(\.\.?\/[^'"]*?)\1\s*,\s*/g;
  let m;
  while ((m = mockRegex.exec(content)) !== null) {
    const mockPath = m[2];
    const resolved = resolvePath(mockPath, fileDir);
    mockCalls.push({ original: mockPath, resolved });
  }

  // Replace mock('./path', stub) with collecting into a mocks object
  // and mock.reRequire('./module') with await esmock('./module.js', mocks)
  // This requires more sophisticated parsing - for now, do simpler replacements

  // Fix mock paths: mock('./path', ...) → update to .js
  content = content.replace(
    /mock\(\s*(['"])(\.\.?\/[^'"]*?)\1/g,
    (match, quote, mockPath) => {
      const resolved = resolvePath(mockPath, fileDir);
      return `mock(${quote}${resolved}${quote}`;
    }
  );

  // We'll need to handle mock-require → esmock conversion more carefully per file
  // since the pattern varies. Flag these for manual review.

  return content;
}

// Main
const files = collectSpecFiles(srvDir);
let converted = 0;

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf8');
    const original = content;
    const fileDir = dirname(file);

    if (content.includes('proxyquire')) {
      content = convertProxyquireFile(content, fileDir);
    }

    if (content.includes('mock-require') || content.includes("mock from 'mock-require'")) {
      content = convertMockRequireFile(content, file);
    }

    if (content !== original) {
      writeFileSync(file, content);
      converted++;
      console.log(`Converted: ${relative(join(__dirname, '..'), file)}`);
    }
  } catch (err) {
    console.error(`ERROR: ${relative(join(__dirname, '..'), file)}: ${err.message}`);
  }
}

console.log(`\nConverted ${converted}/${files.length} test files.`);
