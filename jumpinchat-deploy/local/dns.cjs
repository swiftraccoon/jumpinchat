// Local profile only: container names and capture-only email MX records.
// This resolver never forwards queries to an external DNS server.
const dgram = require('node:dgram');
const fs = require('node:fs');
const records = JSON.parse(fs.readFileSync('/local/records.json', 'utf8'));
const server = dgram.createSocket('udp4');
const encodeName = name => Buffer.concat(name.split('.').map(part => Buffer.concat([
  Buffer.from([part.length]), Buffer.from(part),
])).concat(Buffer.from([0])));

server.on('message', (query, remote) => {
  try {
    if (query.length < 17 || query.readUInt16BE(4) !== 1) return;
    let offset = 12;
    const labels = [];
    while (query[offset]) {
      const length = query[offset++];
      if (length > 63 || offset + length >= query.length) return;
      labels.push(query.subarray(offset, offset + length).toString());
      offset += length;
    }
    offset += 1;
    if (offset + 4 > query.length) return;
    const type = query.readUInt16BE(offset);
    const name = labels.join('.').toLowerCase();
    const question = query.subarray(12, offset + 4);
    let body;
    if (type === 1 && records[name]) body = Buffer.from(records[name].split('.').map(Number));
    // Any syntactically valid account email stays inside the local Mailpit inbox.
    if (type === 15) body = Buffer.concat([Buffer.from([0, 10]), encodeName('mailpit')]);
    const header = Buffer.alloc(12);
    query.copy(header, 0, 0, 2);
    header.writeUInt16BE(0x8180, 2);
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(body ? 1 : 0, 6);
    let answer = Buffer.alloc(0);
    if (body) {
      const metadata = Buffer.alloc(12);
      metadata.writeUInt16BE(0xc00c, 0);
      metadata.writeUInt16BE(type, 2);
      metadata.writeUInt16BE(1, 4);
      metadata.writeUInt32BE(60, 6);
      metadata.writeUInt16BE(body.length, 10);
      answer = Buffer.concat([metadata, body]);
    }
    server.send(Buffer.concat([header, question, answer]), remote.port, remote.address);
  } catch {
    // Ignore malformed local queries without terminating the resolver.
  }
});
server.bind(53, '0.0.0.0');
