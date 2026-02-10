#!/usr/bin/env node
/**
 * Find modules that are imported as default but only have named exports.
 * Add a default export that re-exports all named exports as an object.
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

const files = collectFiles(srvDir);

// Step 1: Collect all default imports of local modules
const defaultImports = new Map(); // resolved path -> [importing files]

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const fileDir = dirname(file);

  // Match: import X from './relative/path.js'
  const importRe = /import\s+(\w+)\s+from\s+['"](\.\.[^'"]*|\.\/[^'"]*)['"]/g;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const importPath = m[2];
    const resolved = resolve(fileDir, importPath);

    if (!defaultImports.has(resolved)) {
      defaultImports.set(resolved, []);
    }
    defaultImports.get(resolved).push(relative(srvDir, file));
  }
}

// Step 2: Check each imported module for missing default export
let fixed = 0;

for (const [resolvedPath, importers] of defaultImports) {
  if (!existsSync(resolvedPath)) continue;

  const content = readFileSync(resolvedPath, 'utf8');

  // Check if it has a default export
  const hasDefault = /export\s+default\b/.test(content);
  if (hasDefault) continue;

  // Check if it has named exports
  const namedExportRe = /export\s+(?:async\s+)?function\s+(\w+)|export\s+(?:const|let|var)\s+(\w+)|export\s+\{\s*(\w+(?:\s*,\s*\w+)*)\s*\}/g;
  const namedExports = [];
  let em;
  while ((em = namedExportRe.exec(content)) !== null) {
    if (em[1]) namedExports.push(em[1]);
    if (em[2]) namedExports.push(em[2]);
    if (em[3]) {
      em[3].split(',').forEach(n => {
        const name = n.trim();
        if (name) namedExports.push(name);
      });
    }
  }

  if (namedExports.length === 0) continue;

  // Add a default export at the end of the file
  const relPath = relative(srvDir, resolvedPath);
  const uniqueExports = [...new Set(namedExports)];
  const defaultExportLine = `\nexport default { ${uniqueExports.join(', ')} };\n`;

  writeFileSync(resolvedPath, content + defaultExportLine);
  fixed++;
  console.log(`Added default export to ${relPath}: { ${uniqueExports.join(', ')} }`);
  console.log(`  Imported by: ${importers.join(', ')}`);
}

console.log(`\nFixed ${fixed} files.`);
