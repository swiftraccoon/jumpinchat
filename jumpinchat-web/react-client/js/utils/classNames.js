/**
 * Join class names from strings, numbers, arrays and `{ name: condition }`
 * objects, skipping falsy values.
 */
export default function classNames(...args) {
  const names = [];

  const append = (value) => {
    if (!value) {
      return;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      names.push(String(value));
    } else if (Array.isArray(value)) {
      value.forEach(append);
    } else if (typeof value === 'object') {
      Object.keys(value).forEach((key) => {
        if (value[key]) {
          names.push(key);
        }
      });
    }
  };

  args.forEach(append);

  return names.join(' ');
}
