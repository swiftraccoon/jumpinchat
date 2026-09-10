/**
 * Calendar day/month/year of `date` as observed in an IANA time zone.
 * Month is 1-based.
 */
export function zonedDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  const read = type => Number(parts.find(part => part.type === type).value);

  return { day: read('day'), month: read('month'), year: read('year') };
}

export default { zonedDateParts };
