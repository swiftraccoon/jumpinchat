export function getPublicBaseUrl(value = process.env.PUBLIC_BASE_URL) {
  if (value == null || value === '') return 'https://jumpin.chat';
  const message = 'PUBLIC_BASE_URL must be an HTTPS origin without credentials, a path, query or fragment';
  try {
    if (typeof value !== 'string' || !/^https:\/\/[^/?#\s\\@]+\/?$/i.test(value)) throw new Error(message);
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/') {
      throw new Error(message);
    }
    return parsed.origin;
  } catch {
    throw new Error(message);
  }
}
