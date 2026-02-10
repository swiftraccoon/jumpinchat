#!/usr/bin/env node
/**
 * Fix multi-line destructured requires that weren't caught by the main converter.
 * These are patterns like:
 *   const {
 *     foo,
 *     bar,
 *   } = require('./module'); // TODO: ESM
 *
 * Also fixes:
 * - const server = require('http').createServer(app)
 * - const proxyquire = require('proxyquire').noCallThru()
 * - const x = require('y').z  (chained member access)
 * - Remaining inline require() calls
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srvDir = join(__dirname, '..', 'srv');

function isRelative(p) {
  return p.startsWith('./') || p.startsWith('../') || p.startsWith('/');
}

function fixRelativeImport(p) {
  if (!isRelative(p)) return p;
  if (/\.\w+$/.test(p)) return p;
  return p + '.js';
}

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

  // Fix 1: Multi-line destructured require() → import { ... } from '...'
  // Pattern: const/let/var {\n  prop1,\n  prop2,\n} = require('...'); // TODO
  const multilineRequire = /^(const|let|var)\s+(\{[\s\S]*?\})\s*=\s*require\((['"])([^'"]+)\3\)\s*;?\s*(\/\/.*)?$/gm;
  content = content.replace(multilineRequire, (match, keyword, destructure, quote, modPath, comment) => {
    // Clean up the TODO comments
    const fixedPath = fixRelativeImport(modPath);
    // Normalize the destructure - put on one line if short enough, keep multi-line otherwise
    const members = destructure
      .replace(/[{}]/g, '')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (members.length <= 3) {
      changed = true;
      return `import { ${members.join(', ')} } from '${fixedPath}';`;
    } else {
      changed = true;
      return `import {\n  ${members.join(',\n  ')},\n} from '${fixedPath}';`;
    }
  });

  // Fix 2: } = require('...') on its own line (continuation of multi-line destructure above import)
  // This handles cases where the const { is on a previous line that was already partially converted
  // Pattern: find blocks like:
  //   import ...;  ← previous imports
  //   const {      ← start of destructure
  //     foo,
  //   } = require('...'); // TODO
  // We need to merge the const { ... } lines with the require
  const hangingDestructure = /^(const|let|var)\s+\{([^}]*)\n([\s\S]*?)\}\s*=\s*require\((['"])([^'"]+)\4\)\s*;?\s*(\/\/.*)?$/gm;
  content = content.replace(hangingDestructure, (match, keyword, firstLine, middleLines, quote, modPath, comment) => {
    const fixedPath = fixRelativeImport(modPath);
    const allMembers = (firstLine + ',' + middleLines)
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    changed = true;
    if (allMembers.length <= 3) {
      return `import { ${allMembers.join(', ')} } from '${fixedPath}';`;
    }
    return `import {\n  ${allMembers.join(',\n  ')},\n} from '${fixedPath}';`;
  });

  // Fix 3: const server = require('http').createServer(app) → import http from 'http'; const server = http.createServer(app);
  const requireChainMatch = /^(const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\3\)\.(\w+)\(([^)]*)\)\s*;?\s*$/gm;
  content = content.replace(requireChainMatch, (match, keyword, varName, quote, modPath, method, args) => {
    const fixedPath = fixRelativeImport(modPath);
    const safeName = modPath.replace(/[^a-zA-Z0-9]/g, '_');
    // Check if we already have an import for this module
    if (content.includes(`import ${safeName} from '${fixedPath}'`)) {
      changed = true;
      return `const ${varName} = ${safeName}.${method}(${args});`;
    }
    changed = true;
    return `import ${safeName} from '${fixedPath}';\nconst ${varName} = ${safeName}.${method}(${args});`;
  });

  // Fix 4: const x = require('proxyquire').noCallThru() → import proxyquire from 'proxyquire'; const x = proxyquire.noCallThru();
  // Also handles .noCallThru().noPreserveCache()
  const requireMethodChain = /^(const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\3\)((?:\.\w+\(\))+)\s*;?\s*$/gm;
  content = content.replace(requireMethodChain, (match, keyword, varName, quote, modPath, chain) => {
    const fixedPath = fixRelativeImport(modPath);
    // For proxyquire, use esmock instead
    if (modPath === 'proxyquire') {
      changed = true;
      return `import esmock from 'esmock';`;
    }
    const safeName = modPath.replace(/[^a-zA-Z0-9]/g, '_');
    changed = true;
    return `import ${safeName}Base from '${fixedPath}';\nconst ${varName} = ${safeName}Base${chain};`;
  });

  // Fix 5: Lines with inline require() in expressions (with TODO comment)
  // Already handled by Fix 1 above for multi-line destructures
  // Clean up any remaining triple TODO comments
  content = content.replace(/\/\/ TODO: ESM - inline require needs manual conversion(?:\s*\/\/ TODO: ESM - inline require needs manual conversion)*/g,
    '// TODO: ESM - inline require needs manual conversion');

  // Fix 6: Remove stale TODO markers on lines that no longer have require()
  content = content.replace(/^(.+?)(?<!\brequire\b.*)\/\/ TODO: ESM - inline require needs manual conversion$/gm, (match, line) => {
    if (line.includes('require(')) return match;
    return line.trimEnd();
  });

  // Fix 7: roomMock = Object.assign({}, require('../room.mock.json'))
  // → import roomMockData from '../room.mock.json' assert { type: 'json' }; ... roomMock = Object.assign({}, roomMockData)
  const jsonRequireMatch = /require\((['"])([^'"]+\.json)\1\)/g;
  const jsonImports = [];
  content = content.replace(jsonRequireMatch, (match, quote, modPath) => {
    const fixedPath = fixRelativeImport(modPath);
    const safeName = modPath.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    // Check if we already have this import
    if (!content.includes(`import ${safeName}`)) {
      jsonImports.push(`import ${safeName} from '${fixedPath}' with { type: 'json' };`);
    }
    changed = true;
    return safeName;
  });

  // Insert JSON imports at the top (after existing imports)
  if (jsonImports.length > 0) {
    const lastImportIdx = content.lastIndexOf('\nimport ');
    if (lastImportIdx !== -1) {
      const lineEnd = content.indexOf('\n', lastImportIdx + 1);
      content = content.slice(0, lineEnd + 1) + jsonImports.join('\n') + '\n' + content.slice(lineEnd + 1);
    }
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
