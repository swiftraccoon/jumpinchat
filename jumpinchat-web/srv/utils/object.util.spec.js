import { expect } from 'chai';
import { deepMerge, pick, omit, groupBy } from './object.util.js';

describe('object.util deepMerge', () => {
  it('merges nested plain objects into the target and returns it', () => {
    const target = { mongo: { uri: 'a', options: { poolSize: 5 } }, port: 80 };
    const result = deepMerge(target, { mongo: { options: { autoIndex: false } }, port: 8080 });

    expect(result).to.equal(target);
    expect(result).to.eql({ mongo: { uri: 'a', options: { poolSize: 5, autoIndex: false } }, port: 8080 });
  });

  it('merges arrays by index like lodash', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [9] })).to.eql({ list: [9, 2, 3] });
    expect(deepMerge({}, { list: [{ a: 1 }] })).to.eql({ list: [{ a: 1 }] });
  });

  it('skips undefined source values when the target already has one', () => {
    expect(deepMerge({ secret: 'keep' }, { secret: undefined })).to.eql({ secret: 'keep' });
    expect(deepMerge({}, { secret: undefined })).to.have.property('secret', undefined);
  });

  it('does not share nested objects with the source', () => {
    const source = { nested: { value: 1 } };
    const result = deepMerge({}, source);
    result.nested.value = 2;
    expect(source.nested.value).to.equal(1);
  });

  it('assigns non-plain values by reference', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const fn = () => {};
    expect(deepMerge({}, { date, fn })).to.eql({ date, fn });
    expect(deepMerge({ date: null }, { date }).date).to.equal(date);
  });

  it('ignores null and non-object sources', () => {
    expect(deepMerge({ a: 1 }, null, undefined, 'x')).to.eql({ a: 1 });
  });
});

describe('object.util pick', () => {
  it('keeps only the requested keys that exist', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c', 'missing'])).to.eql({ a: 1, c: 3 });
  });

  it('includes inherited getters, as Mongoose documents expose', () => {
    const proto = { get name() { return 'room'; } };
    const doc = Object.create(proto);
    doc.owner = 'me';
    expect(pick(doc, ['name', 'owner'])).to.eql({ name: 'room', owner: 'me' });
  });

  it('returns an empty object for nullish input', () => {
    expect(pick(null, ['a'])).to.eql({});
  });
});

describe('object.util omit', () => {
  it('drops the given keys and keeps the rest', () => {
    expect(omit({ a: 1, b: 2, sessionId: 's' }, ['sessionId'])).to.eql({ a: 1, b: 2 });
  });

  it('copies inherited enumerable properties', () => {
    const doc = Object.create({ inherited: true });
    doc.own = 1;
    expect(omit(doc, [])).to.eql({ inherited: true, own: 1 });
  });

  it('does not mutate the source', () => {
    const source = { a: 1, b: 2 };
    omit(source, ['a']);
    expect(source).to.eql({ a: 1, b: 2 });
  });
});

describe('object.util groupBy', () => {
  it('groups by an iteratee function', () => {
    const grouped = groupBy([1.2, 1.7, 2.1], Math.floor);
    expect(grouped).to.eql({ 1: [1.2, 1.7], 2: [2.1] });
  });

  it('groups by a property name', () => {
    expect(groupBy([{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'a', v: 3 }], 't')).to.eql({
      a: [{ t: 'a', v: 1 }, { t: 'a', v: 3 }],
      b: [{ t: 'b', v: 2 }],
    });
  });

  it('uses the property-key form of Date results', () => {
    const date = new Date('2026-01-01T05:00:00.000Z');
    const grouped = groupBy([{ x: 1 }], () => date);
    expect(Object.keys(grouped)).to.eql([String(date)]);
  });

  it('tolerates a missing collection', () => {
    expect(groupBy(undefined, 'x')).to.eql({});
  });
});
