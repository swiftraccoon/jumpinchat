import assert from 'node:assert/strict';
import { parseFingerprint, updateSessionFingerprint, updateAccountFingerprint } from './fingerprint.util.js';

describe('fingerprint version migration', () => {
  it('retains a trusted legacy session identifier across the SDK upgrade', () => {
    const session = { fingerprint: 'old-id' };
    updateSessionFingerprint(session, { fp: 'new-id', fingerprintVersion: '5.2.0', legacyFingerprints: ['injected'] });
    assert.deepEqual(session.fingerprintHistory, [
      { value: 'old-id', version: 'legacy' }, { value: 'new-id', version: '5.2.0' },
    ]);
    assert.equal(session.fingerprintVersion, '5.2.0');
  });

  it('preserves history on authenticated accounts and bounds repeated changes', () => {
    const auth = { latestFingerprint: 'old-account' };
    updateAccountFingerprint(auth, parseFingerprint('current', '5.2.0'));
    assert.equal(auth.fingerprintHistory[0].value, 'old-account');
    for (let n = 0; n < 10; n += 1) updateAccountFingerprint(auth, parseFingerprint(`id-${n}`, '5.2.0'));
    updateAccountFingerprint(auth, parseFingerprint('id-9', '5.2.0'));
    assert.equal(auth.fingerprintHistory.length, 5);
    assert.equal(auth.fingerprintHistory.at(-1).value, 'id-9');
  });

  it('keeps the last known identifier when browser fingerprinting fails', () => {
    const session = { fingerprint: 'known' };
    for (const fp of [undefined, '', {}, 'a'.repeat(129)]) updateSessionFingerprint(session, { fp });
    updateSessionFingerprint(session, { fp: 'new', fingerprintVersion: {} });
    assert.deepEqual(session, { fingerprint: 'known' });
  });

  it('does not invent a legacy identifier for a new guest', () => {
    const session = {};
    updateSessionFingerprint(session, { fp: 'new', fingerprintVersion: '5.2.0' });
    assert.deepEqual(session.fingerprintHistory, [{ value: 'new', version: '5.2.0' }]);
  });
});
