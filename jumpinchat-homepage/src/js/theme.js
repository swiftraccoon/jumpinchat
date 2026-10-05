// The chat client uses the same JSON boolean for guest preferences.
export function readTheme(browser) {
  const accountTheme = browser.document.documentElement.dataset.themeAccount;
  if (accountTheme !== undefined) return accountTheme !== 'false';
  try {
    return JSON.parse(browser.localStorage.getItem('darkTheme')) !== false;
  } catch {
    return true;
  }
}

export function initializeTheme(browser = window) {
  const { document } = browser;
  const root = document.documentElement;
  const button = document.querySelector('#theme-toggle');
  const status = document.querySelector('#theme-status');
  const checkbox = document.querySelector('#darkTheme');
  const isAccount = root.dataset.themeAccount !== undefined;

  function apply(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? '#282828' : '#f7f7f7';
    if (button) {
      button.setAttribute('aria-pressed', String(dark));
      button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }
    if (checkbox) checkbox.checked = dark;
  }

  function report(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = !message;
  }

  apply(readTheme(browser));
  if (!button) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const previousDark = root.dataset.theme === 'dark';
    const dark = !previousDark;
    report('');
    apply(dark);

    if (!isAccount) {
      try {
        browser.localStorage.setItem('darkTheme', JSON.stringify(dark));
      } catch {
        report('Theme changed for this visit. Your browser blocked saving it.');
      }
      return;
    }

    button.disabled = true;
    try {
      const response = await browser.fetch(`/api/user/${encodeURIComponent(root.dataset.themeUserId)}/theme?dark=${dark}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Theme preference could not be saved');
      root.dataset.themeAccount = String(dark);
    } catch {
      apply(previousDark);
      report('Could not save your theme. Please try again.');
    } finally {
      button.disabled = false;
    }
  });

  if (!isAccount) {
    browser.addEventListener('storage', (event) => {
      if (event.key === 'darkTheme' || event.key === null) apply(readTheme(browser));
    });
  }
}
