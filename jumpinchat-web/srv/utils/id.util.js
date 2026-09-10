import { randomUUID } from 'node:crypto';

/**
 * Random RFC 4122 v4 identifier. Wraps node:crypto so tests can mock a
 * single seam instead of the core module.
 */
export function generateId() {
  return randomUUID();
}

export default { generateId };
