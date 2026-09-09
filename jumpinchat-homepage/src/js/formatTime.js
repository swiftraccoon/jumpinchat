import { differenceInCalendarDays, format } from 'date-fns';

export function formatCalendarDate(date, now = new Date()) {
  const days = differenceInCalendarDays(date, now);
  if (days === 0) return `Today at ${format(date, 'h:mm a')}`;
  if (days === -1) return `Yesterday at ${format(date, 'h:mm a')}`;
  if (days === 1) return `Tomorrow at ${format(date, 'h:mm a')}`;
  if (days > -7 && days < -1) return `Last ${format(date, 'eeee')} at ${format(date, 'h:mm a')}`;
  if (days > 1 && days < 7) return `${format(date, 'eeee')} at ${format(date, 'h:mm a')}`;
  return format(date, 'MM/dd/yyyy');
}

function formatTimes() {
  document.querySelectorAll('time.convertDate').forEach((element) => {
    const original = element.textContent;
    const date = new Date(original);
    if (Number.isNaN(date.getTime())) return;
    element.textContent = formatCalendarDate(date);
    element.setAttribute('datetime', original);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', formatTimes, { once: true });
else formatTimes();
