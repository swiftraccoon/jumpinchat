// A selected peer-reflexive candidate can retain a TURN relay as its base after
// NAT rewrites the relay endpoint. RFC 8445 section 7.2.5.3.1 defines that base
// as the local candidate used for the successful connectivity check.
export function isTurnRelayPair(connection, pair) {
  if (connection.iceTransportPolicy !== 'relay' || pair?.state !== 'succeeded') return false;
  const local = pair.local;
  if (local?.candidateType === 'relay') return true;
  if (local?.type !== 'local-candidate' || local.candidateType !== 'prflx'
    || typeof local.relatedAddress !== 'string' || !local.relatedAddress
    || !Number.isInteger(local.relatedPort) || local.relatedPort < 1 || local.relatedPort > 65535
    || !['udp', 'tcp'].includes(local.protocol)
    || !['udp', 'tcp', 'tls'].includes(local.relayProtocol)
    || typeof local.url !== 'string' || !/^turns?:\S+$/.test(local.url)
    || typeof local.transportId !== 'string' || !local.transportId) return false;

  // Evidence must come from this PeerConnection and transport. Merely finding
  // an allocated relay somewhere in the browser does not prove it carried media.
  return (connection.stats || []).some(candidate => candidate.type === 'local-candidate'
    && candidate.candidateType === 'relay'
    && candidate.address === local.relatedAddress && candidate.port === local.relatedPort
    && candidate.transportId === local.transportId
    && candidate.protocol === local.protocol
    && candidate.relayProtocol === local.relayProtocol
    && candidate.url === local.url);
}
