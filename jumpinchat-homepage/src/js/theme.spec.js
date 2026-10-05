import { expect } from 'chai';
import sinon from 'sinon';
import { JSDOM } from 'jsdom';
import pug from 'pug';
import { initializeTheme, readTheme } from './theme.js';

const markup = `<!doctype html><html data-theme="dark"><head><meta name="theme-color" content="#282828"></head><body>
  <button id="theme-toggle" hidden aria-label="Dark mode"></button>
  <span id="theme-status" role="status" hidden></span>
  <input id="darkTheme" type="checkbox">
</body></html>`;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('homepage theme', () => {
  let dom;
  let browser;
  let root;
  let button;
  let fetchStub;

  beforeEach(() => {
    dom = new JSDOM(markup, { url: 'https://jumpin.example/settings' });
    browser = dom.window;
    root = browser.document.documentElement;
    button = browser.document.querySelector('#theme-toggle');
    fetchStub = sinon.stub().resolves({ ok: true });
    browser.fetch = fetchStub;
  });

  afterEach(() => dom.window.close());

  const account = (dark) => {
    root.dataset.themeAccount = String(dark);
    root.dataset.themeUserId = 'account-123';
  };

  it('defaults to dark with an accessible, enabled toggle', () => {
    initializeTheme(browser);
    expect(root.dataset.theme).to.equal('dark');
    expect(button.hidden).to.equal(false);
    expect(button.getAttribute('aria-pressed')).to.equal('true');
    expect(button.title).to.equal('Switch to light mode');
  });

  it('preserves an explicit guest light preference', () => {
    browser.localStorage.setItem('darkTheme', 'false');
    initializeTheme(browser);
    expect(root.dataset.theme).to.equal('light');
    expect(button.getAttribute('aria-pressed')).to.equal('false');
    expect(browser.document.querySelector('meta[name="theme-color"]').content).to.equal('#f7f7f7');
  });

  it('uses dark for malformed or non-boolean guest preferences', () => {
    ['invalid json', 'null', '0', '"false"', '{}'].forEach((value) => {
      browser.localStorage.setItem('darkTheme', value);
      expect(readTheme(browser)).to.equal(true);
    });
  });

  it('persists guest toggles using the same boolean key as the room', () => {
    initializeTheme(browser);
    button.click();
    expect(root.dataset.theme).to.equal('light');
    expect(browser.localStorage.getItem('darkTheme')).to.equal('false');
    button.click();
    expect(root.dataset.theme).to.equal('dark');
    expect(browser.localStorage.getItem('darkTheme')).to.equal('true');
    expect(fetchStub.called).to.equal(false);
  });

  it('still toggles for this visit when localStorage is unavailable', () => {
    Object.defineProperty(browser, 'localStorage', { get: () => { throw new Error('Blocked'); } });
    initializeTheme(browser);
    button.click();
    expect(root.dataset.theme).to.equal('light');
    expect(browser.document.querySelector('#theme-status').textContent).to.include('for this visit');
  });

  it('gives account light preference priority over guest dark', () => {
    account(false);
    browser.localStorage.setItem('darkTheme', 'true');
    initializeTheme(browser);
    expect(root.dataset.theme).to.equal('light');
    expect(browser.document.querySelector('#darkTheme').checked).to.equal(false);
  });

  it('gives account dark preference priority over guest light', () => {
    account(true);
    browser.localStorage.setItem('darkTheme', 'false');
    initializeTheme(browser);
    expect(root.dataset.theme).to.equal('dark');
  });

  it('saves account toggles and synchronizes the settings checkbox without overwriting guest preference', async () => {
    account(true);
    browser.localStorage.setItem('darkTheme', 'true');
    initializeTheme(browser);
    button.click();
    expect(button.disabled).to.equal(true);
    expect(browser.document.querySelector('#darkTheme').checked).to.equal(false);
    await flush();
    expect(fetchStub.firstCall.args).to.deep.equal(['/api/user/account-123/theme?dark=false', {
      method: 'PUT', credentials: 'same-origin', headers: { Accept: 'application/json' },
    }]);
    expect(root.dataset.themeAccount).to.equal('false');
    expect(button.disabled).to.equal(false);
    expect(browser.localStorage.getItem('darkTheme')).to.equal('true');
  });

  it('restores the previous theme and checkbox when saving fails', async () => {
    account(true);
    fetchStub.resolves({ ok: false });
    initializeTheme(browser);
    button.click();
    await flush();
    expect(root.dataset.theme).to.equal('dark');
    expect(root.dataset.themeAccount).to.equal('true');
    expect(browser.document.querySelector('#darkTheme').checked).to.equal(true);
    expect(button.disabled).to.equal(false);
    expect(browser.document.querySelector('#theme-status').textContent).to.include('Could not save');
  });

  it('handles a network rejection and prevents overlapping account saves', async () => {
    account(false);
    fetchStub.rejects(new Error('Network unavailable'));
    initializeTheme(browser);
    button.click();
    button.click();
    await flush();
    expect(fetchStub.callCount).to.equal(1);
    expect(root.dataset.theme).to.equal('light');
    expect(button.disabled).to.equal(false);
  });

  it('updates guest pages for theme changes in another tab', () => {
    initializeTheme(browser);
    browser.localStorage.setItem('darkTheme', 'false');
    browser.dispatchEvent(new browser.StorageEvent('storage', { key: 'darkTheme', newValue: 'false' }));
    expect(root.dataset.theme).to.equal('light');
    browser.localStorage.clear();
    browser.dispatchEvent(new browser.StorageEvent('storage', { key: null }));
    expect(root.dataset.theme).to.equal('dark');
  });

  it('does not let guest storage events change an account preference', () => {
    account(true);
    initializeTheme(browser);
    browser.localStorage.setItem('darkTheme', 'false');
    browser.dispatchEvent(new browser.StorageEvent('storage', { key: 'darkTheme', newValue: 'false' }));
    expect(root.dataset.theme).to.equal('dark');
  });
});

describe('homepage theme before styles load', () => {
  const render = pug.compileFile('templates/views/login.pug');
  const locals = {
    asset: value => value, description: '', publicBaseUrl: 'https://jumpin.example',
    canonicalUrl: 'https://jumpin.example/login', section: 'Login',
    user: null, supportEnabled: false,
  };

  function page(user, preference) {
    return new JSDOM(render({ ...locals, user }), {
      url: locals.canonicalUrl,
      runScripts: 'dangerously',
      beforeParse(browser) {
        if (preference !== undefined) browser.localStorage.setItem('darkTheme', preference);
      },
    });
  }

  it('renders dark by default before any external styles or modules load', () => {
    const dom = page(null);
    const { document } = dom.window;
    expect(document.documentElement.dataset.theme).to.equal('dark');
    const nodes = [...document.head.children];
    expect(nodes.findIndex(node => node.tagName === 'STYLE')).to.be.lessThan(nodes.findIndex(node => node.rel === 'stylesheet'));
    expect(nodes.findIndex(node => node.tagName === 'SCRIPT')).to.be.lessThan(nodes.findIndex(node => node.rel === 'stylesheet'));
    expect(document.querySelector('style').textContent).to.include('#282828');
    dom.window.close();
  });

  it('applies guest light before CSS and keeps browser chrome consistent', () => {
    const dom = page(null, 'false');
    expect(dom.window.document.documentElement.dataset.theme).to.equal('light');
    expect(dom.window.document.querySelector('meta[name="theme-color"]').content).to.equal('#f7f7f7');
    dom.window.close();
  });

  it('renders explicit account light and defaults missing account preferences to dark', () => {
    const user = { _id: '123', username: 'alice', attrs: { userLevel: 0 }, settings: { darkTheme: false } };
    const light = page(user, 'true');
    expect(light.window.document.documentElement.dataset.theme).to.equal('light');
    light.window.close();
    const dark = page({ ...user, settings: {} }, 'false');
    expect(dark.window.document.documentElement.dataset.theme).to.equal('dark');
    dark.window.close();
  });
});
