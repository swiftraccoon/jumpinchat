import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import { parseIsoDuration, isoDurationToSeconds } from './duration.util.js';

function durationsInNewYork(cases) {
  // Isolate TZ from the main suite so other date tests keep their environment.
  const source = `
    import { isoDurationToSeconds } from ${JSON.stringify(new URL('./duration.util.js', import.meta.url).href)};
    const cases = ${JSON.stringify(cases)};
    console.log(JSON.stringify(cases.map(([duration, start]) =>
      isoDurationToSeconds(duration, new Date(start)))));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
    timeout: 5000,
  }));
}

describe('duration.util', () => {
  describe('parseIsoDuration', () => {
    it('parses every unit', () => {
      expect(parseIsoDuration('P1Y2M3W4DT5H6M7S')).to.eql({
        years: 1, months: 2, weeks: 3, days: 4, hours: 5, minutes: 6, seconds: 7,
      });
    });

    it('accepts a fractional smallest unit with a dot or a comma', () => {
      expect(parseIsoDuration('PT1.5S').seconds).to.equal(1.5);
      expect(parseIsoDuration('PT2,5M').minutes).to.equal(2.5);
    });

    it('rejects fractions on larger units', () => {
      expect(() => parseIsoDuration('PT1.5H30M')).to.throw(RangeError, 'smallest unit');
    });

    it('rejects durations without any unit', () => {
      expect(() => parseIsoDuration('P1S')).to.throw(RangeError, 'invalid duration: P1S');
      expect(() => parseIsoDuration('nope')).to.throw(RangeError);
    });
  });

  describe('isoDurationToSeconds', () => {
    it('converts YouTube style time durations', () => {
      expect(isoDurationToSeconds('PT1H2M3S')).to.equal(3723);
      expect(isoDurationToSeconds('PT45S')).to.equal(45);
      expect(isoDurationToSeconds('PT0.5S')).to.equal(0.5);
    });

    it('converts days and weeks', () => {
      const start = new Date('2026-06-01T00:00:00.000Z');
      expect(isoDurationToSeconds('P1DT1S', start)).to.equal(86401);
      expect(isoDurationToSeconds('P1W', start)).to.equal(604800);
    });

    it('measures calendar months from the start date', () => {
      // Local-time dates in months without daylight-saving changes.
      expect(isoDurationToSeconds('P1M', new Date(2026, 1, 1))).to.equal(28 * 86400);
      expect(isoDurationToSeconds('P1M', new Date(2026, 6, 1))).to.equal(31 * 86400);
    });

    it('keeps time units exact across the spring-forward gap', () => {
      const start = '2026-03-08T01:30:00-05:00';
      expect(durationsInNewYork([
        ['PT2H', start], ['PT120M', start], ['PT7200S', start], ['PT1.5H', start],
      ])).to.eql([7200, 7200, 7200, 5400]);
    });

    it('keeps time units exact across the fall-back overlap', () => {
      const start = '2026-11-01T00:30:00-04:00';
      expect(durationsInNewYork([
        ['PT2H', start], ['PT2H1M0.5S', start],
      ])).to.eql([7200, 7260.5]);
    });

    it('preserves an instant in the second repeated hour when calendar units are zero', () => {
      const start = '2026-11-01T01:30:00-05:00';
      expect(durationsInNewYork([
        ['PT0S', start], ['PT45S', start], ['P0Y0M0DT15M', start],
      ])).to.eql([0, 45, 900]);
    });

    it('retains local calendar days and months across DST while adding exact time units', () => {
      expect(durationsInNewYork([
        ['P1D', '2026-03-07T12:00:00-05:00'],
        ['P1D', '2026-10-31T12:00:00-04:00'],
        ['P1M', '2026-02-08T12:00:00-05:00'],
        ['P1DT2H', '2026-03-07T12:00:00-05:00'],
      ])).to.eql([23 * 3600, 25 * 3600, 28 * 86400 - 3600, 25 * 3600]);
    });
  });
});
