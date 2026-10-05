import assert from 'node:assert/strict';
import test from 'node:test';
import { isTurnRelayPair } from './media-relay-stats.mjs';

function fixture() {
  const relay = {
    id: 'relay', type: 'local-candidate', candidateType: 'relay',
    address: '192.0.2.10', port: 49169, protocol: 'udp', relayProtocol: 'udp',
    url: 'turn:relay.example.test:3478?transport=udp', transportId: 'transport',
  };
  const local = {
    ...relay, id: 'derived', candidateType: 'prflx', port: 56934,
    relatedAddress: relay.address, relatedPort: relay.port,
  };
  const pair = { state: 'succeeded', nominated: true, local };
  const connection = { iceTransportPolicy: 'relay', stats: [relay, local], selected: [pair] };
  return { connection, pair, relay, local };
}

test('accepts a selected literal relay under relay policy', () => {
  const { connection, pair, relay } = fixture();
  pair.local = relay;
  assert.equal(isTurnRelayPair(connection, pair), true);
});

test('accepts a peer-reflexive candidate with a proven relay base in the same transport', () => {
  const { connection, pair } = fixture();
  assert.equal(isTurnRelayPair(connection, pair), true);
});

test('rejects a missing relay base or a base from another PeerConnection', () => {
  const { connection, pair, local, relay } = fixture();
  connection.stats = [local];
  assert.equal(isTurnRelayPair(connection, pair), false);
  connection.otherPeerConnection = { stats: [relay] };
  assert.equal(isTurnRelayPair(connection, pair), false);
});

test('rejects an unmatched related address or port', () => {
  for (const field of ['relatedAddress', 'relatedPort']) {
    const { connection, pair, local } = fixture();
    local[field] = field === 'relatedAddress' ? '192.0.2.20' : 49170;
    assert.equal(isTurnRelayPair(connection, pair), false, field);
  }
});

test('rejects missing, non-TURN, or mismatched TURN URLs', () => {
  for (const url of [undefined, '', 'stun:relay.example.test:3478', 'turn:another.example.test:3478']) {
    const { connection, pair, local } = fixture();
    local.url = url;
    assert.equal(isTurnRelayPair(connection, pair), false, String(url));
  }
});

test('rejects missing protocol evidence even if both candidates omit it', () => {
  for (const field of ['protocol', 'relayProtocol', 'transportId']) {
    const { connection, pair, local, relay } = fixture();
    delete local[field];
    delete relay[field];
    assert.equal(isTurnRelayPair(connection, pair), false, field);
  }
});

test('rejects a base with different transport or protocol evidence', () => {
  for (const [field, value] of [['transportId', 'another-transport'], ['protocol', 'tcp'], ['relayProtocol', 'tcp']]) {
    const { connection, pair, relay } = fixture();
    relay[field] = value;
    assert.equal(isTurnRelayPair(connection, pair), false, field);
  }
});

test('rejects an unproven host or server-reflexive base', () => {
  for (const type of ['host', 'srflx', 'prflx']) {
    const { connection, pair, relay } = fixture();
    relay.candidateType = type;
    assert.equal(isTurnRelayPair(connection, pair), false, type);
  }
});

test('rejects non-relay policy for literal and derived relay candidates', () => {
  const { connection, pair, relay } = fixture();
  connection.iceTransportPolicy = 'all';
  assert.equal(isTurnRelayPair(connection, pair), false);
  pair.local = relay;
  assert.equal(isTurnRelayPair(connection, pair), false);
});

test('rejects unsuccessful pairs even when candidate evidence is present', () => {
  for (const state of ['waiting', 'in-progress', 'failed']) {
    const { connection, pair } = fixture();
    pair.state = state;
    assert.equal(isTurnRelayPair(connection, pair), false, state);
  }
});
