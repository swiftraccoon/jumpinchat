#!/usr/bin/env node
/**
 * CJS-to-ESM automated converter for jumpinchat-web/srv
 *
 * Handles:
 * - const x = require('y') → import x from 'y'
 * - const { a, b } = require('y') → import { a, b } from 'y'
 * - const x = require('y').z → import pkg from 'y'; const x = pkg.z;
 * - require('y') (side-effect) → import 'y'
 * - require('y')(args) (factory call) → import factory from 'y'; const result = factory(args)
 * - module.exports = expr → export default expr
 * - module.exports.x = function ... → export function x ...
 * - module.exports.x = async function ... → export async function x ...
 * - module.exports.x = expr → export const x = expr
 * - exports.x = expr → export const x = expr
 * - __dirname → import.meta.dirname (Node 21.2+) or fileURLToPath workaround
 * - Lazy require() inside functions → const { default: x } = await import('y')
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srvDir = join(__dirname, '..', 'srv');

// Collect all .js files recursively
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

// Check if a require path is a relative path
function isRelative(p) {
  return p.startsWith('./') || p.startsWith('../') || p.startsWith('/');
}

// Add .js extension to relative imports if not already present
function fixRelativeImport(p) {
  if (!isRelative(p)) return p;
  // Don't add extension if it already has one
  if (/\.\w+$/.test(p)) return p;
  return p + '.js';
}

function convertFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const relPath = relative(join(__dirname, '..'), filePath);

  const imports = [];
  const postImportLines = [];
  let needsDirnameImport = false;
  let exportLines = [];
  let hasDefaultExport = false;

  // Split into lines for processing
  let lines = content.split('\n');
  const newLines = [];

  // Track if we need to handle the file specially
  const isSpecFile = filePath.endsWith('.spec.js');

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let handled = false;

    // Skip empty lines and comments (pass through)
    if (/^\s*$/.test(line) || /^\s*\/\//.test(line) || /^\s*\/?\*/.test(line)) {
      newLines.push(line);
      continue;
    }

    // --- REQUIRE PATTERNS ---

    // Pattern: const x = require('y')(args) — factory call (like bunyan, connect-redis)
    // e.g., const log = require('../utils/logger.util')({ name: 'foo' })
    // e.g., const RedisStore = require('connect-redis')(session)
    // e.g., const sass = require('gulp-sass')(require('sass'))
    const factoryCallMatch = line.match(/^(const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\3\)\s*\((.*)\)\s*;?\s*$/);
    if (factoryCallMatch) {
      const [, , varName, , modPath, args] = factoryCallMatch;
      const fixedPath = fixRelativeImport(modPath);
      // Check if args contains another require
      const nestedReqMatch = args.match(/^require\((['"])([^'"]+)\1\)$/);
      if (nestedReqMatch) {
        const [, , nestedPath] = nestedReqMatch;
        const fixedNestedPath = fixRelativeImport(nestedPath);
        imports.push(`import ${varName}Factory from '${fixedPath}';`);
        imports.push(`import ${varName}Arg from '${fixedNestedPath}';`);
        postImportLines.push(`const ${varName} = ${varName}Factory(${varName}Arg);`);
      } else {
        imports.push(`import ${varName}Factory from '${fixedPath}';`);
        postImportLines.push(`const ${varName} = ${varName}Factory(${args});`);
      }
      handled = true;
    }

    // Pattern: const { a, b } = require('y')
    if (!handled) {
      const destructureMatch = line.match(/^(const|let|var)\s+(\{[^}]+\})\s*=\s*require\((['"])([^'"]+)\3\)\s*;?\s*$/);
      if (destructureMatch) {
        const [, , destructure, , modPath] = destructureMatch;
        const fixedPath = fixRelativeImport(modPath);
        imports.push(`import ${destructure} from '${fixedPath}';`);
        handled = true;
      }
    }

    // Pattern: const x = require('y').z — member access
    if (!handled) {
      const memberMatch = line.match(/^(const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\3\)\.(\w+)\s*;?\s*$/);
      if (memberMatch) {
        const [, , varName, , modPath, member] = memberMatch;
        const fixedPath = fixRelativeImport(modPath);
        if (varName === member) {
          imports.push(`import { ${member} } from '${fixedPath}';`);
        } else {
          imports.push(`import { ${member} as ${varName} } from '${fixedPath}';`);
        }
        handled = true;
      }
    }

    // Pattern: const x = require('y')
    if (!handled) {
      const simpleMatch = line.match(/^(const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\3\)\s*;?\s*$/);
      if (simpleMatch) {
        const [, , varName, , modPath] = simpleMatch;
        const fixedPath = fixRelativeImport(modPath);
        imports.push(`import ${varName} from '${fixedPath}';`);
        handled = true;
      }
    }

    // Pattern: require('y')(args); — side-effect factory call (no assignment)
    // e.g., require('./config/express.config')(app, sio);
    if (!handled) {
      const sideEffectFactoryMatch = line.match(/^require\((['"])([^'"]+)\1\)\s*\((.*)\)\s*;?\s*$/);
      if (sideEffectFactoryMatch) {
        const [, , modPath, args] = sideEffectFactoryMatch;
        const fixedPath = fixRelativeImport(modPath);
        // Generate a unique import name based on the module path
        const safeName = modPath.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        imports.push(`import ${safeName} from '${fixedPath}';`);
        postImportLines.push(`${safeName}(${args});`);
        handled = true;
      }
    }

    // Pattern: require('y'); — pure side-effect import
    if (!handled) {
      const sideEffectMatch = line.match(/^require\((['"])([^'"]+)\1\)\s*;?\s*$/);
      if (sideEffectMatch) {
        const [, , modPath] = sideEffectMatch;
        const fixedPath = fixRelativeImport(modPath);
        imports.push(`import '${fixedPath}';`);
        handled = true;
      }
    }

    // Pattern: const x = exports.x = require('y') or const x = exports.x = expr
    if (!handled) {
      const exportsAssignMatch = line.match(/^(const|let|var)\s+(\w+)\s*=\s*exports\.(\w+)\s*=\s*(.+);?\s*$/);
      if (exportsAssignMatch) {
        const [, , varName, exportName, expr] = exportsAssignMatch;
        // Check if expr is a require
        const reqMatch = expr.match(/^require\((['"])([^'"]+)\1\)$/);
        if (reqMatch) {
          const fixedPath = fixRelativeImport(reqMatch[2]);
          imports.push(`import ${varName} from '${fixedPath}';`);
          exportLines.push(varName);
        } else {
          // It's a regular expression
          newLines.push(`export const ${varName} = ${expr};`);
        }
        handled = true;
      }
    }

    // --- EXPORT PATTERNS ---

    // Pattern: module.exports = function name(args) { ... — default export function
    if (!handled) {
      const exportFnMatch = line.match(/^module\.exports\s*=\s*(async\s+)?function\s+(\w+)\s*\((.*)$/);
      if (exportFnMatch) {
        const [, asyncPart, fnName, rest] = exportFnMatch;
        const asyncStr = asyncPart || '';
        newLines.push(`export default ${asyncStr}function ${fnName}(${rest}`);
        hasDefaultExport = true;
        handled = true;
      }
    }

    // Pattern: module.exports = function(args) { ... — anonymous default export
    if (!handled) {
      const exportAnonFnMatch = line.match(/^module\.exports\s*=\s*(async\s+)?function\s*\((.*)$/);
      if (exportAnonFnMatch) {
        const [, asyncPart, rest] = exportAnonFnMatch;
        const asyncStr = asyncPart || '';
        newLines.push(`export default ${asyncStr}function(${rest}`);
        hasDefaultExport = true;
        handled = true;
      }
    }

    // Pattern: module.exports.x = function name(args) { ... — named export function
    if (!handled) {
      const namedExportFnMatch = line.match(/^module\.exports\.(\w+)\s*=\s*(async\s+)?function\s+\w+\s*\((.*)$/);
      if (namedExportFnMatch) {
        const [, exportName, asyncPart, rest] = namedExportFnMatch;
        const asyncStr = asyncPart || '';
        newLines.push(`export ${asyncStr}function ${exportName}(${rest}`);
        handled = true;
      }
    }

    // Pattern: module.exports.x = function(args) { ... — anonymous named export function
    if (!handled) {
      const namedExportAnonFnMatch = line.match(/^module\.exports\.(\w+)\s*=\s*(async\s+)?function\s*\((.*)$/);
      if (namedExportAnonFnMatch) {
        const [, exportName, asyncPart, rest] = namedExportAnonFnMatch;
        const asyncStr = asyncPart || '';
        newLines.push(`export ${asyncStr}function ${exportName}(${rest}`);
        handled = true;
      }
    }

    // Pattern: module.exports.x = expr; — named export value (single line)
    if (!handled) {
      const namedExportValMatch = line.match(/^module\.exports\.(\w+)\s*=\s*(.+);?\s*$/);
      if (namedExportValMatch) {
        const [, exportName, expr] = namedExportValMatch;
        // If it's just a variable name that matches, use a simple export
        if (expr.trim().replace(/;$/, '') === exportName) {
          newLines.push(`export { ${exportName} };`);
        } else {
          newLines.push(`export const ${exportName} = ${expr}`);
        }
        handled = true;
      }
    }

    // Pattern: module.exports = expr; — default export (not function)
    // Needs to come AFTER function patterns
    if (!handled) {
      const defaultExportMatch = line.match(/^module\.exports\s*=\s*(.+);?\s*$/);
      if (defaultExportMatch && !hasDefaultExport) {
        const expr = defaultExportMatch[1].trim().replace(/;$/, '');
        // Check if it's a multiline expression (e.g., module.exports = { ... no closing brace)
        if (expr === '{' || (expr.includes('{') && !expr.includes('}'))) {
          newLines.push(`export default ${expr}`);
        } else {
          newLines.push(`export default ${expr};`);
        }
        hasDefaultExport = true;
        handled = true;
      }
    }

    // --- __dirname / __filename ---
    if (!handled && line.includes('__dirname')) {
      // Replace __dirname with import.meta.dirname (Node 21.2+)
      // For Node 18 compat, use fileURLToPath
      line = line.replace(/__dirname/g, '__dirname');
      needsDirnameImport = true;
      newLines.push(line);
      handled = true;
    }

    if (!handled && line.includes('__filename')) {
      line = line.replace(/__filename/g, '__filename');
      needsDirnameImport = true;
      newLines.push(line);
      handled = true;
    }

    // --- LAZY REQUIRES (inside functions) ---
    // Pattern: const X = require('y'); inside a function (indented)
    if (!handled) {
      const lazyReqMatch = line.match(/^(\s+)(const|let|var)\s+(\w+)\s*=\s*require\((['"])([^'"]+)\4\)\s*;?\s*$/);
      if (lazyReqMatch) {
        const [, indent, , varName, , modPath] = lazyReqMatch;
        const fixedPath = fixRelativeImport(modPath);
        // Convert to dynamic import
        newLines.push(`${indent}const { default: ${varName} } = await import('${fixedPath}');`);
        handled = true;
      }
    }

    // --- INLINE REQUIRE in expressions (not at top level) ---
    // Pattern: something(require('y'), ...) — inline require in function call
    if (!handled && /require\(/.test(line) && !/^(const|let|var|module\.exports|exports)/.test(line.trim())) {
      // Leave these for manual fixing - just mark them
      newLines.push(line + ' // TODO: ESM - inline require needs manual conversion');
      handled = true;
    }

    if (!handled) {
      newLines.push(line);
    }
  }

  // Build the final output
  let output = '';

  // Add dirname/filename helper if needed
  if (needsDirnameImport) {
    imports.unshift("import { fileURLToPath } from 'url';");
    imports.unshift("import { dirname } from 'path';");
    postImportLines.unshift('const __filename = fileURLToPath(import.meta.url);');
    postImportLines.unshift('const __dirname = dirname(__filename);');
  }

  // Find where the imports should go (skip leading comments)
  let insertIdx = 0;
  for (let i = 0; i < newLines.length; i++) {
    const trimmed = newLines[i].trim();
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      insertIdx = i + 1;
    } else {
      break;
    }
  }

  // Build output: leading comments + imports + post-import lines + rest
  const leading = newLines.slice(0, insertIdx);
  const rest = newLines.slice(insertIdx);

  const parts = [];
  if (leading.length > 0) parts.push(leading.join('\n'));
  if (imports.length > 0) parts.push(imports.join('\n'));
  if (postImportLines.length > 0) parts.push(postImportLines.join('\n'));
  if (rest.length > 0) parts.push(rest.join('\n'));

  output = parts.join('\n');

  // Add collected export names at the end if any
  if (exportLines.length > 0) {
    output += `\nexport { ${exportLines.join(', ')} };\n`;
  }

  return output;
}

// Main
const files = collectFiles(srvDir);
let converted = 0;
let errors = [];

for (const file of files) {
  try {
    const original = readFileSync(file, 'utf8');
    const result = convertFile(file);
    if (result !== original) {
      writeFileSync(file, result);
      converted++;
      console.log(`Converted: ${relative(join(__dirname, '..'), file)}`);
    }
  } catch (err) {
    errors.push({ file: relative(join(__dirname, '..'), file), error: err.message });
    console.error(`ERROR: ${relative(join(__dirname, '..'), file)}: ${err.message}`);
  }
}

console.log(`\nDone. Converted ${converted}/${files.length} files.`);
if (errors.length > 0) {
  console.log(`\nErrors (${errors.length}):`);
  errors.forEach(e => console.log(`  ${e.file}: ${e.error}`));
}
