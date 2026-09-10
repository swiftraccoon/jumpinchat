const NUMBER = '\\d+';
const FRACTION = `${NUMBER}(?:[.,]${NUMBER})?`;
const PATTERN = new RegExp(`^P(?:(${NUMBER})Y)?(?:(${NUMBER})M)?(?:(${NUMBER})W)?(?:(${NUMBER})D)?`
  + `(?:T(?:(${FRACTION})H)?(?:(${FRACTION})M)?(?:(${FRACTION})S)?)?`);
const UNITS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];

/**
 * Parse an ISO 8601 duration (`PnYnMnWnDTnHnMnS`) into unit counts.
 * Only the smallest present unit may be fractional.
 */
export function parseIsoDuration(input) {
  const matches = String(input).replace(/,/g, '.').match(PATTERN);
  const values = matches ? matches.slice(1) : [];

  if (!matches || values.every(value => value === undefined)) {
    throw new RangeError(`invalid duration: ${input}`);
  }

  const fractionalIndex = values.findIndex(value => /\./.test(value || ''));
  const lastPresentIndex = values.reduce((last, value, index) => (value === undefined ? last : index), -1);
  if (fractionalIndex !== -1 && fractionalIndex !== lastPresentIndex) {
    throw new RangeError('only the smallest unit can be fractional');
  }

  return Object.fromEntries(UNITS.map((unit, index) => [unit, parseFloat(values[index] || '0') || 0]));
}

/**
 * Seconds covered by an ISO 8601 duration. Calendar units (years, months,
 * days, weeks) are measured from `startDate`, so month lengths and daylight
 * saving changes are respected; hours, minutes and seconds are exact.
 */
export function isoDurationToSeconds(input, startDate = new Date()) {
  const duration = parseIsoDuration(input);
  const end = new Date(startDate.getTime());

  // Even unchanged local calendar setters can move the second occurrence of
  // a repeated hour back to the first, so only apply nonzero calendar units.
  if (duration.years) end.setFullYear(end.getFullYear() + duration.years);
  if (duration.months) end.setMonth(end.getMonth() + duration.months);
  const calendarDays = duration.days + (duration.weeks * 7);
  if (calendarDays) end.setDate(end.getDate() + calendarDays);

  const elapsedMilliseconds = (duration.hours * 3600 * 1000)
    + (duration.minutes * 60 * 1000)
    + (duration.seconds * 1000);

  return (end.getTime() - startDate.getTime() + elapsedMilliseconds) / 1000;
}

export default { parseIsoDuration, isoDurationToSeconds };
