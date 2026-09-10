/**
 * Escape the characters that have meaning inside a RegExp source string.
 */
export function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export default { escapeRegExp };
