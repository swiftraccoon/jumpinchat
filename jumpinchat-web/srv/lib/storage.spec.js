import { expect } from 'chai';
import esmock from 'esmock';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

async function readContent(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('storage (local backend)', () => {
  let storage;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jic-storage-test-'));

    storage = await esmock('./storage.js', {
      '../config/env/index.js': {
        default: {
          uploads: { basePath: tmpDir },
        },
      },
      '../utils/logger.util.js': {
        default: () => ({
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        }),
      },
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('upload', () => {
    it('should write a file to the public directory with correct content', async () => {
      const key = 'avatars/test-image.png';
      const content = Buffer.from('fake png data');

      await storage.upload(key, content, 'image/png');

      const dest = path.join(tmpDir, 'public', 'avatars', 'test-image.png');
      const result = await fs.readFile(dest);
      expect(result.equals(content)).to.equal(true);
    });

    it('should create intermediate directories as needed', async () => {
      const key = 'deep/nested/dir/file.jpg';
      const content = Buffer.from('jpg data');

      await storage.upload(key, content, 'image/jpeg');

      const dest = path.join(tmpDir, 'public', 'deep', 'nested', 'dir', 'file.jpg');
      const result = await fs.readFile(dest);
      expect(result.equals(content)).to.equal(true);
    });

    it('should sanitize path traversal attempts into safe paths', async () => {
      // ../../../etc/passwd gets sanitized to etc/passwd (safe, inside public dir)
      const key = '../../../etc/passwd';
      const content = Buffer.from('data');

      await storage.upload(key, content, 'text/plain');

      // File should end up inside public dir, not at /etc/passwd
      const dest = path.join(tmpDir, 'public', 'etc', 'passwd');
      const result = await fs.readFile(dest);
      expect(result.equals(content)).to.equal(true);
    });
  });

  describe('getUrl', () => {
    it('should return /uploads/<key>', () => {
      const url = storage.getUrl('avatars/test-image.png');
      expect(url).to.equal('/uploads/avatars/test-image.png');
    });

    it('should sanitize the key', () => {
      const url = storage.getUrl('some file (1).png');
      expect(url).to.equal('/uploads/somefile1.png');
    });
  });

  describe('remove', () => {
    it('should delete an existing file', async () => {
      const key = 'avatars/to-delete.png';
      const content = Buffer.from('delete me');

      await storage.upload(key, content, 'image/png');

      const dest = path.join(tmpDir, 'public', 'avatars', 'to-delete.png');
      await fs.access(dest); // should exist

      await storage.remove(key);

      try {
        await fs.access(dest);
        expect.fail('file should have been removed');
      } catch (err) {
        expect(err.code).to.equal('ENOENT');
      }
    });

    it('should not throw when removing a nonexistent file', async () => {
      // Should complete without throwing
      await storage.remove('nonexistent/file.png');
    });
  });

  describe('uploadPrivate', () => {
    it('should write a file to the private directory and return the dest path', async () => {
      const subDir = 'verification';
      const key = 'photo-123.jpg';
      const content = Buffer.from('private photo data');

      const dest = await storage.uploadPrivate(content, subDir, key);

      expect(dest).to.equal(path.join(tmpDir, 'private', 'verification', 'photo-123.jpg'));

      const result = await fs.readFile(dest);
      expect(result.equals(content)).to.equal(true);
    });

    it('should create intermediate directories as needed', async () => {
      const subDir = 'reports/screenshots';
      const key = 'shot.png';
      const content = Buffer.from('screenshot data');

      const dest = await storage.uploadPrivate(content, subDir, key);

      const result = await fs.readFile(dest);
      expect(result.equals(content)).to.equal(true);
      expect(dest).to.include(path.join('private', 'reports', 'screenshots', 'shot.png'));
    });
  });

  describe('readPrivate', () => {
    it('streams an existing absolute private file reference', async () => {
      const content = Buffer.from('private photo');
      const filePath = await storage.uploadPrivate(content, 'verification', 'photo.jpg');
      expect(await readContent(await storage.readPrivate(filePath))).to.deep.equal(content);
    });

    it('reads a preserved S3 key after its object has been copied to local storage', async () => {
      const content = Buffer.from('migrated private photo');
      await storage.uploadPrivate(content, 'verification', 'photo.jpg');
      expect(await readContent(await storage.readPrivate('private/verification/photo.jpg')))
        .to.deep.equal(content);
    });

    it('refuses public files and symlinks outside the private directory', async () => {
      await storage.upload('photo.jpg', Buffer.from('public photo'));
      await fs.mkdir(path.join(tmpDir, 'private'));
      const publicFile = path.join(tmpDir, 'public', 'photo.jpg');
      await assert.rejects(storage.readPrivate(publicFile), { code: 'EPRIVATEPATH' });
      const link = path.join(tmpDir, 'private', 'photo.jpg');
      await fs.symlink(publicFile, link);
      await assert.rejects(storage.readPrivate(link), { code: 'EPRIVATEPATH' });
    });

    it('reports a missing private image', async () => {
      await assert.rejects(storage.readPrivate(path.join(tmpDir, 'private', 'missing.jpg')), {
        code: 'ENOENT',
      });
    });
  });
});

describe('storage (S3 backend)', () => {
  let storage;
  let commands;
  let objects;

  beforeEach(async () => {
    commands = [];
    objects = new Map();
    class PutObjectCommand { constructor(input) { this.input = input; } }
    class GetObjectCommand { constructor(input) { this.input = input; } }
    class S3Client {
      async send(command) {
        commands.push(command);
        const { Key, Body } = command.input;
        if (command instanceof PutObjectCommand) {
          objects.set(Key, Body);
          return {};
        }
        if (!objects.has(Key)) {
          const error = new Error('missing object');
          error.name = 'NoSuchKey';
          throw error;
        }
        return { Body: Readable.from([objects.get(Key)]) };
      }
    }
    storage = await esmock.p('./storage.js', {
      '../config/env/index.js': {
        default: {
          uploads: { basePath: '/data/uploads' },
          storage: {
            backend: 's3', s3AccessKey: 'fixture', s3SecretKey: 'fixture', s3Bucket: 'uploads',
          },
        },
      },
      '../utils/logger.util.js': {
        default: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
      },
      '@aws-sdk/client-s3': { S3Client, PutObjectCommand, GetObjectCommand },
    });
  });

  afterEach(() => esmock.purge(storage));

  it('streams the private object key returned by upload without a public URL', async () => {
    const content = Buffer.from('private screenshot');
    const key = await storage.uploadPrivate(content, 'report-screenshots', 'image.png');
    expect(key).to.equal('private/report-screenshots/image.png');
    expect(await readContent(await storage.readPrivate(key))).to.deep.equal(content);
    expect(commands[1].input).to.deep.equal({ Bucket: 'uploads', Key: key });
  });

  it('rejects keys outside private storage before making a request', async () => {
    await assert.rejects(storage.readPrivate('public/avatar.png'), { code: 'EPRIVATEPATH' });
    await assert.rejects(storage.readPrivate('/data/uploads/public/image.png'), {
      code: 'EPRIVATEPATH',
    });
    expect(commands).to.have.length(0);
  });

  it('reads a preserved local reference after its file has been copied to S3', async () => {
    const content = Buffer.from('migrated private screenshot');
    objects.set('private/report-screenshots/image.png', content);
    expect(await readContent(await storage.readPrivate('/data/uploads/private/report-screenshots/image.png')))
      .to.deep.equal(content);
    expect(commands[0].input.Key).to.equal('private/report-screenshots/image.png');
  });

  it('normalizes a missing S3 object to a missing local file error', async () => {
    await assert.rejects(storage.readPrivate('private/reports/missing.png'), { code: 'ENOENT' });
  });
});
