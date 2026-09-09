import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
import { JSDOM } from 'jsdom';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const formMarkup = type => `
  <form class="imageUpload__Form--${type}" action="/api/upload/${type}">
    <div class="imageUpload__Container"><img class="imageUpload__Preview"></div>
    <input type="file" class="imageUpload__File">
    <button class="imageUpload__UploadButton" type="submit">Upload</button>
    <span class="imageUpload__Loading u-hidden"></span>
    <span class="imageUpload__Status--success u-hidden"></span>
    <span class="imageUpload__Status--error u-hidden"></span>
    <label class="imageUpload__Label">Choose an image</label>
  </form>`;

describe('browser dependency migrations', () => {
  let dom;
  let sandbox;
  let originalGlobals;
  let instances;
  let readiness;
  let ImageUpload;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    dom = new JSDOM(`${formMarkup('useravatar')}${formMarkup('roomdisplay')}`, { url: 'https://jumpin.example/settings' });
    const globals = {
      window: dom.window,
      document: dom.window.document,
      FormData: dom.window.FormData,
      URL: Object.assign(class extends URL {}, { createObjectURL: sandbox.stub().returns('blob:test-image'), revokeObjectURL: sandbox.spy() }),
      fetch: sandbox.stub().resolves({ ok: true }),
    };
    originalGlobals = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Object.entries(globals).forEach(([name, value]) => Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }));
    instances = [];
    readiness = [];
    class Cropper {
      constructor() {
        this.image = { $ready: () => readiness.shift()?.promise || Promise.resolve(), $center: sandbox.spy() };
        this.selection = {
          $change: sandbox.spy(),
          $toCanvas: sandbox.stub().resolves({ toBlob: callback => callback(new dom.window.Blob(['png'], { type: 'image/png' })) }),
        };
        this.canvas = { remove: sandbox.spy() };
        instances.push(this);
      }
      getCropperImage() { return this.image; }
      getCropperSelection() { return this.selection; }
      getCropperCanvas() { return this.canvas; }
    }
    ImageUpload = await esmock.strict('./imageUpload.js', { cropperjs: { default: Cropper } });
  });

  afterEach(() => {
    sandbox.restore();
    dom.window.close();
    Object.entries(originalGlobals).forEach(([name, descriptor]) => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  });

  for (const [type, dimensions] of [
    ['useravatar', { width: 256, height: 256 }],
    ['roomdisplay', { width: 320, height: 240 }],
  ]) {
    it(`exports ${type} through Cropper 2 at the original upload dimensions`, async () => {
      const uploader = new ImageUpload(`.imageUpload__Form--${type}`);
      await uploader.selectFile({ type: 'image/png' });
      await uploader.upload({ preventDefault() {} });
      expect(instances[0].selection.aspectRatio).to.equal(dimensions.width / dimensions.height);
      expect(instances[0].selection.$toCanvas.firstCall.args).to.deep.equal([dimensions]);
      expect(fetch.callCount).to.equal(1);
      expect(fetch.firstCall.args[1].method).to.equal('PUT');
      expect(fetch.firstCall.args[1].body.get('image').name).to.equal('image.png');
      expect(uploader.success.classList.contains('u-hidden')).to.equal(false);
    });
  }

  it('removes the previous cropper and ignores an out-of-order image load', async () => {
    const first = deferred();
    const second = deferred();
    readiness.push(first, second);
    const uploader = new ImageUpload('.imageUpload__Form--useravatar');
    const oldLoad = uploader.selectFile({ type: 'image/png' });
    const newLoad = uploader.selectFile({ type: 'image/jpeg' });
    first.resolve();
    await oldLoad;
    expect(instances[0].canvas.remove.callCount).to.equal(1);
    expect(instances[0].image.$center.called).to.equal(false);
    expect(uploader.submitButton.disabled).to.equal(true);
    second.resolve();
    await newLoad;
    expect(instances[1].image.$center.firstCall.args).to.deep.equal(['cover']);
    expect(uploader.submitButton.disabled).to.equal(false);
    expect(URL.revokeObjectURL.callCount).to.equal(1);
  });

  it('binds one submit handler across repeated file choices and prevents duplicate uploads', async () => {
    const uploader = new ImageUpload('.imageUpload__Form--useravatar');
    await uploader.selectFile({ type: 'image/png' });
    await uploader.selectFile({ type: 'image/jpeg' });
    const response = deferred();
    fetch.returns(response.promise);
    uploader.targetElement.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    uploader.targetElement.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetch.callCount).to.equal(1);
    response.resolve({ ok: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(uploader.uploading).to.equal(false);
  });

  it('renders upload errors as text and allows a retry', async () => {
    const uploader = new ImageUpload('.imageUpload__Form--useravatar');
    await uploader.selectFile({ type: 'image/png' });
    fetch.resolves({ ok: false, status: 400, json: async () => ({ message: '<strong>Server message</strong>' }) });
    await uploader.upload({ preventDefault() {} });
    expect(uploader.error.textContent).to.equal('<strong>Server message</strong>');
    expect(uploader.error.querySelector('strong')).to.equal(null);
    expect(uploader.submitButton.disabled).to.equal(false);
    fetch.resolves({ ok: true });
    await uploader.upload({ preventDefault() {} });
    expect(uploader.success.classList.contains('u-hidden')).to.equal(false);
  });

  it('handles canceled, non-image and unreadable files without enabling upload', async () => {
    const uploader = new ImageUpload('.imageUpload__Form--useravatar');
    await uploader.selectFile(undefined);
    await uploader.selectFile({ type: 'text/plain' });
    expect(instances.length).to.equal(0);
    const load = deferred();
    readiness.push(load);
    const selected = uploader.selectFile({ type: 'image/png' });
    load.reject(new Error('bad image'));
    await selected;
    expect(uploader.submitButton.disabled).to.equal(true);
    expect(uploader.error.textContent).to.include('could not be opened');
  });

  it('keeps calendar wording and falls back to an absolute date outside the current week', async () => {
    const { formatCalendarDate } = await import('./formatTime.js');
    const now = new Date(2026, 8, 9, 12);
    expect(formatCalendarDate(new Date(2026, 8, 9, 9, 5), now)).to.equal('Today at 9:05 AM');
    expect(formatCalendarDate(new Date(2026, 8, 8, 17, 0), now)).to.equal('Yesterday at 5:00 PM');
    expect(formatCalendarDate(new Date(2026, 8, 10, 10, 0), now)).to.equal('Tomorrow at 10:00 AM');
    expect(formatCalendarDate(new Date(2026, 8, 7, 9, 0), now)).to.equal('Last Monday at 9:00 AM');
    expect(formatCalendarDate(new Date(2026, 8, 16), now)).to.equal('09/16/2026');
  });

  it('sends Fingerprint 5 identifiers with their algorithm version', async () => {
    const get = sandbox.stub().resolves({ visitorId: 'current-id', version: '5.2.0' });
    await esmock.strict('./genFingerprint.js', {
      '@fingerprintjs/fingerprintjs': { default: { load: async () => ({ get }) } },
    });
    await window.genFp();
    expect(JSON.parse(fetch.firstCall.args[1].body)).to.deep.equal({ fp: 'current-id', fingerprintVersion: '5.2.0' });
    expect(fetch.firstCall.args[0]).to.equal('/session/register');
  });
});
