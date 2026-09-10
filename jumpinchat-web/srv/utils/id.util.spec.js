import { expect } from 'chai';
import { generateId } from './id.util.js';

describe('id.util', () => {
  it('returns RFC 4122 v4 identifiers', () => {
    const id = generateId();
    expect(id).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns a different identifier on every call', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).to.equal(50);
  });
});
