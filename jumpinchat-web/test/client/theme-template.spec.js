import { readFileSync } from 'node:fs';
import { expect } from 'chai';
import ejs from 'ejs';
import { JSDOM } from 'jsdom';

const template = readFileSync(new URL('../../react-client/index.ejs', import.meta.url), 'utf8');

function renderTheme({ account = null, saved, blocked = false } = {}) {
  const html = ejs.render(template, {
    roomTitle: 'Test room', roomDescription: 'A room', roomDisplay: '/image.png',
    room: { name: 'test', attrs: {} }, sentryDsn: '', supportEnabled: false, initialAccountDarkTheme: account,
  });
  const page = new JSDOM(html, { url: 'https://example.test/room', runScripts: 'outside-only' });
  if (blocked) Object.defineProperty(page.window, 'localStorage', { get() { throw new Error('Blocked'); } });
  else if (saved !== undefined) page.window.localStorage.setItem('darkTheme', saved);
  for (const script of page.window.document.scripts) {
    if (script.textContent.includes('INITIAL_ACCOUNT_DARK_THEME') || script.textContent.includes('document.body.classList.toggle')) {
      page.window.eval(script.textContent);
    }
  }
  return { page, html };
}

describe('room appearance before the application loads', () => {
  for (const test of [
    { label: 'fresh guest', dark: true },
    { label: 'guest light', saved: 'false', dark: false },
    { label: 'guest dark', saved: 'true', dark: true },
    { label: 'corrupt storage', saved: '{invalid', dark: true },
    { label: 'blocked storage', blocked: true, dark: true },
    { label: 'account light before guest dark', account: false, saved: 'true', dark: false },
    { label: 'account dark before guest light', account: true, saved: 'false', dark: true },
  ]) {
    it(`renders ${test.label} without waiting for the external bundle`, () => {
      const { page, html } = renderTheme(test);
      const { document } = page.window;
      expect(document.documentElement.dataset.theme).to.equal(test.dark ? 'dark' : 'light');
      expect(document.documentElement.style.colorScheme).to.equal(test.dark ? 'dark' : 'light');
      expect(document.body.classList.contains('dark')).to.equal(test.dark);
      expect(document.querySelector('meta[name="theme-color"]').content).to.equal(test.dark ? '#282828' : '#ffffff');
      expect(html.indexOf('INITIAL_ACCOUNT_DARK_THEME')).to.be.lessThan(html.indexOf('/styles/main.css'));
      expect(html).to.include('html { background: #282828; color: #ebdbb2; }');
      page.window.close();
    });
  }
});
