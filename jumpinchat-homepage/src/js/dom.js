/**
 * Run `callback` once the document has been parsed. Module scripts execute
 * after parsing, so this only defers when loaded another way.
 */
export function onReady(callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
}

/**
 * Form-encoded request, matching what the previous jQuery calls sent.
 */
export function sendForm(url, method, fields = {}) {
  return fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(fields),
  });
}
