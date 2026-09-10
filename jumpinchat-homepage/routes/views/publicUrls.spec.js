import { expect } from 'chai';
import esmock from 'esmock';
import pug from 'pug';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const publicBaseUrl = 'https://localhost:18443';
const render = pug.compileFile(fileURLToPath(new URL('../../templates/layouts/default.pug', import.meta.url)));

async function viewLocals(path) {
  const { initLocals } = await esmock.strict('../middleware.js', {
    '../../utils/userUtils.js': { getUserById() {} },
    '../../utils/messageUtils.js': { getUnreadMessages() {} },
    '../../config/index.js': { default: { publicBaseUrl, stripe: { publicKey: '' } } },
    '../../utils/logger.js': { default: () => ({}) },
  });
  const req = { path, headers: { host: 'another.example' }, originalUrl: `${path}?page=2` };
  const res = { locals: {} };
  initLocals(req, res, () => {});
  return res.locals;
}

describe('public URLs in rendered homepage views', () => {
  it('uses the configured origin for page metadata and images', async () => {
    const locals = await viewLocals('/directory');
    const dom = new JSDOM(render(locals));
    try {
      const { document } = dom.window;
      expect(document.querySelector('link[rel="canonical"]').href).to.equal(`${publicBaseUrl}/directory`);
      for (const selector of ['meta[property="og:url"]', 'meta[name="twitter:url"]']) {
        expect(document.querySelector(selector).content).to.equal(`${publicBaseUrl}/directory`);
      }
      for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
        expect(document.querySelector(selector).content).to.equal(`${publicBaseUrl}/images/jiclogo_320x320.png`);
      }
    } finally {
      dom.window.close();
    }
  });

  it('renders homepage room structured data using the same public origin', async () => {
    const home = await esmock.strict('./index.js', {
      '../../utils/roomUtils.js': {
        getRoomList: (_page, _limit, done) => done(null, { rooms: [{
          name: 'tea', settings: { display: 'room/tea.png', description: 'Tea room' },
        }, { name: 'coffee', settings: {} }] }),
        getRecentRooms() {},
      },
      '../../utils/logger.js': { default: () => ({ error() {}, fatal() {} }) },
    });
    const res = { locals: await viewLocals('/'), render() {} };
    await home({ method: 'GET', query: {} }, res);
    const dom = new JSDOM(render(res.locals));
    try {
      const data = JSON.parse(dom.window.document.querySelector('script[type="application/ld+json"]').textContent);
      expect(data.itemListElement[0]).to.include({
        url: `${publicBaseUrl}/tea`, image: `${publicBaseUrl}/uploads/room/tea.png`,
      });
      expect(data.itemListElement[1].url).to.equal(`${publicBaseUrl}/coffee`);
      expect(data.itemListElement[1]).not.to.have.property('image');
    } finally {
      dom.window.close();
    }
  });
});
