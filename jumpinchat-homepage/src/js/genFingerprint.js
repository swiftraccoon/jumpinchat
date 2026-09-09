import Fingerprint from '@fingerprintjs/fingerprintjs';

export async function getFingerprint() {
  const agent = await Fingerprint.load();
  const result = await agent.get();
  return { fp: result.visitorId, fingerprintVersion: result.version };
}

window.genFp = async () => {
  const identity = await getFingerprint();
  return fetch('/session/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(identity),
  });
};
