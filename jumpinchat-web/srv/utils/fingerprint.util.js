const MAX_HISTORY = 5;

export function parseFingerprint(value, version) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) return null;
  if (version != null && (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version))) return null;
  return { value, version: version || 'legacy' };
}

// History comes only from an existing server session or authenticated account.
// Never merge aliases supplied by a browser into an account's history.
export function fingerprintHistory(history = [], previous, next) {
  const records = [...history, previous, next].filter(record => record
    && parseFingerprint(record.value, record.version === 'legacy' ? undefined : record.version));
  return records.filter((record, index) => records.findLastIndex(other =>
    other.value === record.value && other.version === record.version) === index).slice(-MAX_HISTORY)
    .map(({ value, version }) => ({ value, version: version || 'legacy' }));
}

export function updateSessionFingerprint(session, body = {}) {
  const next = parseFingerprint(body.fp, body.fingerprintVersion);
  if (!next) return;
  session.fingerprintHistory = fingerprintHistory(session.fingerprintHistory,
    parseFingerprint(session.fingerprint, session.fingerprintVersion === 'legacy' ? undefined : session.fingerprintVersion), next);
  session.fingerprint = next.value;
  session.fingerprintVersion = next.version;
}

export function updateAccountFingerprint(auth, next) {
  if (!next) return;
  auth.fingerprintHistory = fingerprintHistory(auth.fingerprintHistory,
    parseFingerprint(auth.latestFingerprint, auth.fingerprintVersion === 'legacy' ? undefined : auth.fingerprintVersion), next);
  auth.latestFingerprint = next.value;
  auth.fingerprintVersion = next.version;
}
