const isPlainObject = value => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function mergeValue(current, value) {
  if (isPlainObject(value)) {
    return deepMerge(isPlainObject(current) ? current : {}, value);
  }

  if (Array.isArray(value)) {
    const target = Array.isArray(current) ? current : [];
    value.forEach((item, index) => {
      if (item !== undefined) {
        target[index] = mergeValue(target[index], item);
      }
    });
    return target;
  }

  return value;
}

/**
 * Recursively merge plain objects (and arrays, by index) from the sources
 * into `target`, mutating and returning it. Source values that are
 * `undefined` never overwrite an existing value; non-plain objects such as
 * Dates or class instances are assigned by reference. This is the subset of
 * lodash `merge` behaviour the configuration loaders rely on.
 */
export function deepMerge(target, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      if (value === undefined && key in target) {
        continue;
      }

      target[key] = mergeValue(target[key], value);
    }
  }

  return target;
}


/**
 * New object containing only `keys` that exist on `object` (own or
 * inherited, so Mongoose document getters are included, like lodash `pick`).
 */
export function pick(object, keys) {
  const result = {};
  if (object === null || object === undefined) {
    return result;
  }

  const source = Object(object);
  for (const key of keys) {
    if (key in source) {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Shallow copy of every enumerable property of `object` (own or inherited)
 * except `keys`, like lodash `omit`.
 */
export function omit(object, keys) {
  const result = {};
  if (object === null || object === undefined) {
    return result;
  }

  const excluded = new Set(keys);
  for (const key in object) {
    if (!excluded.has(key)) {
      result[key] = object[key];
    }
  }

  return result;
}

/**
 * Group `collection` items by the property-key form of `iteratee(item)`
 * (or of `item[iteratee]` when a string is given), like lodash `groupBy`.
 */
export function groupBy(collection, iteratee) {
  const getKey = typeof iteratee === 'function' ? iteratee : item => item[iteratee];
  const groups = {};

  for (const item of collection || []) {
    const key = getKey(item);
    if (!Object.prototype.hasOwnProperty.call(groups, key)) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  return groups;
}

export default { deepMerge, pick, omit, groupBy };
