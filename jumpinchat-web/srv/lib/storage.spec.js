import { expect } from 'chai';
import esmock from 'esmock';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

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
});
