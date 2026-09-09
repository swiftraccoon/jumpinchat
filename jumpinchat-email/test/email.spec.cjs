const assert = require('node:assert/strict');
const request = require('supertest');
const sinon = require('sinon');
const nodemailer = require('nodemailer');
const createApp = require('../src/app');

describe('mail delivery API', () => {
  const sharedSecret = 'test-mail-service-secret';
  const message = { to: 'recipient@example.com', subject: 'Hello', text: 'Welcome' };
  let transport;
  let app;
  beforeEach(() => {
    transport = { sendMail: sinon.stub().resolves({ messageId: 'test-id' }) };
    app = createApp({ transport, sharedSecret });
  });

  const send = (target, body = message) => request(target)
    .post('/email/send').set('Authorization', sharedSecret).send(body);

  it('serves health without opening an SMTP connection', async () => {
    await request(app).get('/status').expect(200);
    sinon.assert.notCalled(transport.sendMail);
  });

  it('rejects missing or incorrect service credentials', async () => {
    await request(app).post('/email/send').send(message).expect(401);
    await request(app).post('/email/send').set('Authorization', 'wrong').send(message).expect(401);
    sinon.assert.notCalled(transport.sendMail);
  });

  for (const field of ['to', 'subject', 'text']) {
    it(`rejects a message without ${field}`, async () => {
      const body = { ...message };
      delete body[field];
      await send(app, body).expect(400);
      sinon.assert.notCalled(transport.sendMail);
    });
  }

  it('handles missing and malformed request bodies', async () => {
    await request(app).post('/email/send').set('Authorization', sharedSecret).expect(400);
    await request(app).post('/email/send').set('Authorization', sharedSecret)
      .set('Content-Type', 'application/json').send('{').expect(400);
    sinon.assert.notCalled(transport.sendMail);
  });

  it('confirms success only after SMTP accepts the message', async () => {
    let accept;
    transport.sendMail.callsFake(() => new Promise(resolve => { accept = resolve; }));
    let completed = false;
    const response = send(app).then(result => { completed = true; return result; });
    while (!accept) await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false);
    accept({ messageId: 'accepted' });
    assert.equal((await response).status, 200);
    sinon.assert.calledOnce(transport.sendMail);
    assert.equal(transport.sendMail.firstCall.args[0].text, message.text);
  });

  it('returns a gateway error when SMTP rejects delivery', async () => {
    transport.sendMail.rejects(new Error('SMTP rejected the recipient'));
    const response = await send(app).expect(502);
    assert.equal(response.text, 'Email delivery failed');
  });

  it('passes only supported message fields to Nodemailer', async () => {
    await send(app, { ...message, from: 'sender@example.com', replyTo: 'reply@example.com',
      html: '<p>Welcome</p>', attachments: [{ path: '/private/file' }], raw: 'ignored' }).expect(200);
    assert.deepEqual(transport.sendMail.firstCall.args[0], {
      from: 'sender@example.com', to: message.to, subject: message.subject,
      replyTo: 'reply@example.com', html: '<p>Welcome</p>',
    });
  });

  it('generates valid mail with the current Nodemailer transport', async () => {
    const streamTransport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const sendMail = sinon.spy(streamTransport, 'sendMail');
    await send(createApp({ transport: streamTransport, sharedSecret })).expect(200);
    const result = await sendMail.firstCall.returnValue;
    assert.match(result.message.toString(), /Subject: Hello/);
    assert.match(result.message.toString(), /Welcome/);
    streamTransport.close();
  });
});
