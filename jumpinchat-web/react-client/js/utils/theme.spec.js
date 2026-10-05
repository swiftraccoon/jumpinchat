import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, getGuestDarkTheme, getInitialDarkTheme } from './theme';

afterEach(() => {
  delete window.INITIAL_ACCOUNT_DARK_THEME;
  document.body.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe('room theme', () => {
  it.each([null, 'null', '"light"', '{invalid'])('defaults invalid or absent stored preference %s to dark', (saved) => {
    if (saved !== null) localStorage.setItem('darkTheme', saved);
    expect(getGuestDarkTheme()).toBe(true);
  });
  it('prioritizes the rendered account boolean over guest preferences', () => {
    localStorage.setItem('darkTheme', 'false');
    window.INITIAL_ACCOUNT_DARK_THEME = true;
    expect(getInitialDarkTheme()).toBe(true);
    localStorage.setItem('darkTheme', 'true');
    window.INITIAL_ACCOUNT_DARK_THEME = false;
    expect(getInitialDarkTheme()).toBe(false);
  });
  it('keeps document, native controls, body and browser theme colors synchronized', () => {
    const meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta);
    applyTheme();
    expect(document.body).toHaveClass('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(meta.content).toBe('#282828');
    applyTheme(false);
    expect(document.body).not.toHaveClass('dark');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(meta.content).toBe('#ffffff');
  });
});
