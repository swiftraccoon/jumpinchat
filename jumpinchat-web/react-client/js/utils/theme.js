import { get } from './localStorage';

export function getGuestDarkTheme() {
  try {
    const saved = get('darkTheme');
    return typeof saved === 'boolean' ? saved : true;
  } catch {
    // Storage may be unavailable or contain a preference from an older client.
    return true;
  }
}

export function getInitialDarkTheme() {
  const accountTheme = window.INITIAL_ACCOUNT_DARK_THEME;
  return typeof accountTheme === 'boolean' ? accountTheme : getGuestDarkTheme();
}

export function applyTheme(darkTheme = true) {
  const dark = darkTheme !== false;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.body.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#282828' : '#ffffff');
}
