/**
 * Escape the characters that have meaning inside a RegExp source string.
 */
export function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/**
 * Set a nested value on `object` following a dotted path (or an array of
 * keys), creating intermediate objects as needed. Mutates and returns
 * `object`; a nullish object is returned untouched.
 */
export function setPath(object, path, value) {
  if (object === null || object === undefined) {
    return object;
  }

  const keys = Array.isArray(path) ? path : String(path).split('.').filter(Boolean);
  let node = object;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      node[key] = value;
      return;
    }

    if (node[key] === null || typeof node[key] !== 'object') {
      node[key] = /^\d+$/.test(keys[index + 1]) ? [] : {};
    }

    node = node[key];
  });

  return object;
}

/**
 * Trailing-edge debounce. With `maxWait`, the wrapped function runs at
 * least once every `maxWait` milliseconds while calls keep arriving.
 */
export function debounce(fn, wait = 0, { maxWait } = {}) {
  let timer = null;
  let firstCall = null;
  let lastArgs;
  let lastThis;

  const invoke = () => {
    timer = null;
    firstCall = null;
    const args = lastArgs;
    const context = lastThis;
    lastArgs = undefined;
    lastThis = undefined;
    fn.apply(context, args);
  };

  function debounced(...args) {
    const now = Date.now();
    lastArgs = args;
    lastThis = this;

    if (firstCall === null) {
      firstCall = now;
    }

    if (timer) {
      clearTimeout(timer);
    }

    const delay = maxWait === undefined
      ? wait
      : Math.min(wait, Math.max(0, maxWait - (now - firstCall)));

    timer = setTimeout(invoke, delay);
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;
    firstCall = null;
    lastArgs = undefined;
    lastThis = undefined;
  };

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      invoke();
    }
  };

  return debounced;
}
