import { expect } from 'chai';
import { zonedDateParts } from './date.util.js';

describe('date.util zonedDateParts', () => {
  const instant = new Date('2017-12-31T18:00:00.000Z');

  it('reports the calendar date in a zone ahead of UTC', () => {
    expect(zonedDateParts(instant, 'Pacific/Kiritimati')).to.eql({ day: 1, month: 1, year: 2018 });
  });

  it('reports the calendar date in a zone behind UTC', () => {
    expect(zonedDateParts(instant, 'Pacific/Niue')).to.eql({ day: 31, month: 12, year: 2017 });
  });

  it('uses a 1-based month', () => {
    expect(zonedDateParts(new Date('2026-03-15T12:00:00.000Z'), 'UTC')).to.eql({ day: 15, month: 3, year: 2026 });
  });
});
