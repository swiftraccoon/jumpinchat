import { expect } from 'chai';
import esmock from 'esmock';
import express from 'express';
import request from 'supertest';
import { Readable } from 'node:stream';

const logger = () => ({ debug() {}, info() {}, warn() {}, error() {} });

describe('signed private file downloads', () => {
  let app;
  let tokens;
  let calls;
  let openFile;

  beforeEach(async () => {
    calls = [];
    tokens = await esmock('../../utils/fileToken.util.js', {
      '../../config/env/index.js': { default: { auth: { fileTokenSecret: 'file-token-test-secret' } } },
      '../../utils/logger.util.js': { default: logger },
    });
    openFile = () => Readable.from([Buffer.from('private image bytes')]);
    const { default: router } = await esmock('./index.js', {
      '../../utils/fileToken.util.js': { verifyFileToken: tokens.verifyFileToken },
      '../../utils/logger.util.js': { default: logger },
      '../../lib/storage.js': {
        readPrivate: async (filePath) => {
          calls.push(filePath);
          return openFile(filePath);
        },
      },
    });
    app = express();
    app.use('/api/internal', router);
  });

  for (const [backend, filePath] of [
    ['local', '/data/uploads/private/age-verification/photo.jpg'],
    ['S3', 'private/age-verification/photo.jpg'],
  ]) {
    it(`streams an authorized ${backend} reference with private response headers`, async () => {
      const url = tokens.generateSignedFileUrl(filePath, 60);
      const response = await request(app).get(url).expect(200);
      expect(response.body.toString()).to.equal('private image bytes');
      expect(response.headers['content-type']).to.equal('image/jpeg');
      expect(response.headers['cache-control']).to.equal('private, no-store');
      expect(response.headers['x-content-type-options']).to.equal('nosniff');
      expect(response.headers['content-security-policy']).to.equal("default-src 'none'; sandbox");
      expect(response.headers).not.to.have.property('location');
      expect(calls).to.deep.equal([filePath]);
    });

    it(`rejects expired ${backend} tokens before opening storage`, async () => {
      await request(app).get(tokens.generateSignedFileUrl(filePath, -60)).expect(403);
      expect(calls).to.have.length(0);
    });
  }

  it('rejects an invalid signature before opening storage', async () => {
    const url = tokens.generateSignedFileUrl('private/reports/photo.jpg', 60);
    await request(app).get(`${url}invalid`).expect(403);
    expect(calls).to.have.length(0);
  });

  it('rejects a signed unsupported file type before opening storage', async () => {
    await request(app).get(tokens.generateSignedFileUrl('private/reports/file.html', 60)).expect(403);
    expect(calls).to.have.length(0);
  });

  for (const [code, status] of [['EPRIVATEPATH', 403], ['ENOENT', 404], ['ECONNRESET', 500]]) {
    it(`maps the storage error ${code} to ${status}`, async () => {
      openFile = () => { throw Object.assign(new Error('storage error'), { code }); };
      await request(app).get(tokens.generateSignedFileUrl('private/reports/photo.jpg', 60))
        .expect(status);
    });
  }
});
