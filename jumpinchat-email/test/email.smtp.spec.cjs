const assert = require('node:assert/strict');
const net = require('node:net');
const nodemailer = require('nodemailer');
const request = require('supertest');
const createApp = require('../src/app');

const sharedSecret = 'loopback-smtp-test-secret';
const message = {
  from: 'sender@example.invalid',
  to: 'recipient@example.invalid',
  subject: 'SMTP integration fixture',
  text: 'Welcome to the local delivery test.',
};

// A deliberately small SMTP peer: every connection stays on loopback and no
// mail is relayed. Nodemailer still performs the real envelope and DATA exchange.
async function startSmtp({ rejectRecipient = false, rejectData = false, holdData = false } = {}) {
  const sockets = new Set();
  const captured = { sender: null, recipients: [], mime: null };
  let acceptMessage;
  let received;
  const dataReceived = new Promise(resolve => { received = resolve; });
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    socket.write('220 loopback.example.invalid ESMTP ready\r\n');
    let buffer = '';
    let readingData = false;
    const lines = [];
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (readingData) {
          if (line === '.') {
            readingData = false;
            captured.mime = `${lines.join('\r\n')}\r\n`;
            acceptMessage = () => socket.write(rejectData
              ? '554 5.7.1 Message rejected by fixture\r\n'
              : '250 2.0.0 Message accepted\r\n');
            received();
            if (!holdData) acceptMessage();
          } else lines.push(line.startsWith('..') ? line.slice(1) : line);
          continue;
        }
        const command = line.split(' ', 1)[0].toUpperCase();
        switch (command) {
          case 'EHLO':
          case 'HELO':
            socket.write('250 loopback.example.invalid\r\n');
            break;
          case 'MAIL':
            captured.sender = line.slice('MAIL FROM:'.length);
            socket.write('250 2.1.0 Sender accepted\r\n');
            break;
          case 'RCPT':
            if (rejectRecipient) socket.write('550 5.1.1 Recipient rejected by fixture\r\n');
            else {
              captured.recipients.push(line.slice('RCPT TO:'.length));
              socket.write('250 2.1.5 Recipient accepted\r\n');
            }
            break;
          case 'DATA':
            readingData = true;
            socket.write('354 End data with <CRLF>.<CRLF>\r\n');
            break;
          case 'QUIT':
            socket.end('221 2.0.0 Goodbye\r\n');
            break;
          default:
            socket.write('500 5.5.1 Unsupported fixture command\r\n');
        }
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const transport = nodemailer.createTransport({
    host: '127.0.0.1', port: server.address().port,
    secure: false, ignoreTLS: true,
    connectionTimeout: 2000, greetingTimeout: 2000, socketTimeout: 3000,
  });
  return {
    app: createApp({ transport, sharedSecret }),
    captured,
    dataReceived,
    accept: () => acceptMessage(),
    async close() {
      transport.close();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

describe('real Nodemailer SMTP delivery on loopback', function () {
  this.timeout(5000);
  let smtp;
  afterEach(async () => { if (smtp) await smtp.close(); });

  const send = app => request(app).post('/email/send')
    .set('Authorization', sharedSecret).send(message)
    .timeout({ response: 3500, deadline: 4000 });

  it('waits for SMTP DATA acceptance and delivers the expected envelope and MIME', async () => {
    smtp = await startSmtp({ holdData: true });
    let completed = false;
    const response = send(smtp.app).then(result => { completed = true; return result; });
    await Promise.race([
      smtp.dataReceived,
      response.then(() => { throw new Error('HTTP completed before the SMTP DATA response'); }),
    ]);
    assert.equal(completed, false);
    assert.equal(smtp.captured.sender, '<sender@example.invalid>');
    assert.deepEqual(smtp.captured.recipients, ['<recipient@example.invalid>']);
    assert.match(smtp.captured.mime, /From: sender@example\.invalid\r\n/);
    assert.match(smtp.captured.mime, /To: recipient@example\.invalid\r\n/);
    assert.match(smtp.captured.mime, /Subject: SMTP integration fixture\r\n/);
    assert.match(smtp.captured.mime, /MIME-Version: 1\.0\r\n/);
    assert.match(smtp.captured.mime, /\r\n\r\nWelcome to the local delivery test\.\r\n/);
    smtp.accept();
    assert.equal((await response).status, 200);
  });

  it('maps an SMTP recipient rejection to HTTP 502 without sending DATA', async () => {
    smtp = await startSmtp({ rejectRecipient: true });
    const response = await send(smtp.app).expect(502);
    assert.equal(response.text, 'Email delivery failed');
    assert.deepEqual(smtp.captured.recipients, []);
    assert.equal(smtp.captured.mime, null);
  });

  it('maps rejection after SMTP DATA to HTTP 502', async () => {
    smtp = await startSmtp({ rejectData: true });
    const response = await send(smtp.app).expect(502);
    assert.equal(response.text, 'Email delivery failed');
    assert.match(smtp.captured.mime, /Welcome to the local delivery test\./);
  });
});
