import { expect } from 'chai';
import { deepMerge, pick, omit, groupBy } from './objects.js';

describe('objects', () => {
  describe('deepMerge', () => {
    it('merges nested configuration into the target and returns it', () => {
      const target = { env: 'x', auth: { cookieSecret: 'a', timeout: 1 } };
      const result = deepMerge(target, { auth: { cookieSecret: 'b' }, port: 3000 });
      expect(result).to.equal(target);
      expect(result).to.eql({ env: 'x', auth: { cookieSecret: 'b', timeout: 1 }, port: 3000 });
    });

    it('merges arrays by index and skips undefined values', () => {
      expect(deepMerge({ list: [1, 2] }, { list: [9] })).to.eql({ list: [9, 2] });
      expect(deepMerge({ keep: 1 }, { keep: undefined })).to.eql({ keep: 1 });
    });

    it('does not alias nested source objects', () => {
      const source = { nested: { a: 1 } };
      const result = deepMerge({}, source);
      result.nested.a = 2;
      expect(source.nested.a).to.equal(1);
    });
  });

  describe('pick', () => {
    it('keeps the requested keys, including inherited getters', () => {
      const doc = Object.create({ get name() { return 'room'; } });
      doc.owner = 'me';
      doc.secret = 'x';
      expect(pick(doc, ['name', 'owner', 'missing'])).to.eql({ name: 'room', owner: 'me' });
      expect(pick(null, ['a'])).to.eql({});
    });
  });

  describe('omit', () => {
    it('drops the given keys without mutating the source', () => {
      const source = { a: 1, auth: {}, __v: 0 };
      expect(omit(source, ['auth', '__v'])).to.eql({ a: 1 });
      expect(source).to.have.keys(['a', 'auth', '__v']);
    });
  });

  describe('groupBy', () => {
    it('groups by function or property name', () => {
      expect(groupBy([1.2, 1.7, 2.1], Math.floor)).to.eql({ 1: [1.2, 1.7], 2: [2.1] });
      expect(groupBy([{ t: 'a' }, { t: 'b' }, { t: 'a' }], 't')).to.eql({ a: [{ t: 'a' }, { t: 'a' }], b: [{ t: 'b' }] });
      expect(groupBy(undefined, 't')).to.eql({});
    });
  });
});
