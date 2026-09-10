import { expect } from 'chai';
import sinon from 'sinon';
import { JSDOM } from 'jsdom';

const markup = `
  <form id="register-form">
    <input name="username" value="">
    <div class="register__UsernameText"></div>
    <button type="submit">Register</button>
  </form>
  <ul>
    <li><span>bob</span><button class="settings__UserIgnoreRemove" data-id="abc" data-username="bob">remove</button></li>
  </ul>
  <div><button class="settings__RoomModRemove" data-username="mod">remove mod</button></div>
  <button id="send-verification-email">resend</button>
  <span id="is-verified-string" class="text--red">not verified</span>
  <button class="modal-trigger" data-target="remove-account">open</button>
  <div id="remove-account" class="modal"><button class="modal-btn-close">cancel</button></div>
  <button class="disableOnClick">send</button>`;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const load = name => import(`./${name}.js?instance=${Date.now()}${Math.random()}`);

describe('settings page scripts', () => {
  let dom;
  let sandbox;
  let originalGlobals;
  let fetchStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dom = new JSDOM(markup, { url: 'https://jumpin.example/settings' });
    fetchStub = sandbox.stub();
    const globals = { window: dom.window, document: dom.window.document, fetch: fetchStub };
    originalGlobals = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.entries(globals).forEach(([name, value]) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }));
  });

  afterEach(() => {
    Object.entries(originalGlobals).forEach(([name, descriptor]) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
    sandbox.restore();
    dom.window.close();
  });

  const click = element => element.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  describe('registerHelpers', () => {
    it('disables submission and shows the API message for a taken username', async () => {
      fetchStub.resolves({ ok: false, json: async () => ({ error: 'ERR_TAKEN', message: 'Username is taken' }) });
      await load('registerHelpers');
      const input = document.querySelector('#register-form [name="username"]');
      input.value = 'bob';
      input.dispatchEvent(new dom.window.Event('change'));
      await flush();

      expect(fetchStub.firstCall.args[0]).to.equal('/api/user/checkusername/bob');
      expect(document.querySelector('#register-form [type="submit"]').disabled).to.equal(true);
      const text = document.querySelector('.register__UsernameText');
      expect(text.textContent).to.equal('Username is taken');
      expect(text.classList.contains('text--red')).to.equal(true);
    });

    it('re-enables submission when the username is available', async () => {
      fetchStub.resolves({ ok: true, json: async () => ({}) });
      await load('registerHelpers');
      const input = document.querySelector('#register-form [name="username"]');
      input.value = 'new name';
      input.dispatchEvent(new dom.window.Event('change'));
      await flush();

      expect(fetchStub.firstCall.args[0]).to.equal('/api/user/checkusername/new%20name');
      expect(document.querySelector('#register-form [type="submit"]').disabled).to.equal(false);
      const text = document.querySelector('.register__UsernameText');
      expect(text.textContent).to.equal('Username available!');
      expect(text.classList.contains('text--green')).to.equal(true);
    });
  });

  describe('ignore and moderator removal', () => {
    it('sends a form-encoded DELETE and removes the row on success', async () => {
      fetchStub.resolves({ ok: true });
      await load('userSettings');
      click(document.querySelector('.settings__UserIgnoreRemove'));
      await flush();

      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal('/settings/ignore');
      expect(options.method).to.equal('DELETE');
      expect(options.headers['Content-Type']).to.equal('application/x-www-form-urlencoded');
      expect(options.body.toString()).to.equal('id=abc&username=bob');
      expect(document.querySelector('li')).to.equal(null);
    });

    it('keeps the row when the request fails', async () => {
      fetchStub.resolves({ ok: false });
      await load('roomSettings');
      click(document.querySelector('.settings__RoomModRemove'));
      await flush();

      expect(fetchStub.firstCall.args[1].body.toString()).to.equal('username=mod');
      expect(document.querySelector('.settings__RoomModRemove')).to.not.equal(null);
    });
  });

  describe('verification email', () => {
    it('reports rate limiting', async () => {
      fetchStub.resolves({ ok: false, status: 429 });
      await load('settingsAccount');
      click(document.querySelector('#send-verification-email'));
      await flush();

      expect(fetchStub.firstCall.args[1].method).to.equal('POST');
      expect(document.querySelector('#is-verified-string').textContent).to.equal('Too many attempts, try again in a few minutes');
      expect(document.querySelector('#send-verification-email')).to.not.equal(null);
    });

    it('confirms delivery and removes the button', async () => {
      fetchStub.resolves({ ok: true, status: 200 });
      await load('settingsAccount');
      click(document.querySelector('#send-verification-email'));
      await flush();

      const status = document.querySelector('#is-verified-string');
      expect(status.textContent).to.equal('Verification email sent.');
      expect(status.classList.contains('text--green')).to.equal(true);
      expect(document.querySelector('#send-verification-email')).to.equal(null);
    });
  });

  it('opens and closes modals by target id', async () => {
    await load('modal');
    const modal = document.querySelector('#remove-account');
    click(document.querySelector('.modal-trigger'));
    expect(modal.classList.contains('open')).to.equal(true);
    click(document.querySelector('.modal-btn-close'));
    expect(modal.classList.contains('open')).to.equal(false);
  });

  it('disables submit buttons after they are clicked', async () => {
    await load('disableOnClick');
    const button = document.querySelector('button.disableOnClick');
    click(button);
    expect(button.disabled).to.equal(false);
    await flush();
    expect(button.disabled).to.equal(true);
  });
});
