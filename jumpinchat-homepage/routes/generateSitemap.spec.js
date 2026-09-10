import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';

describe('sitemap API compatibility', () => {
  for (const publicBaseUrl of ['https://jumpin.chat', 'https://localhost:18443']) {
    it(`renders absolute room and image URLs on ${publicBaseUrl}`, async () => {
      const generate = await esmock.strict('./generateSitemap.js', {
        '../config/index.js': { default: { publicBaseUrl } },
        '../models/index.js': {
          Room: { find: () => ({ lean: async () => [{ name: 'tea', settings: {
            display: 'room/tea.png', description: 'Tea & cake',
          } }] }) },
        },
      });
      const res = { header: sinon.stub().returnsThis(), status: sinon.stub().returnsThis(), send: sinon.stub() };
      await generate({}, res);
      assert.equal(res.status.firstCall.args[0], 200);
      const xml = res.send.firstCall.args[0];
      assert.ok(xml.includes(`<loc>${publicBaseUrl}/</loc>`));
      assert.ok(xml.includes(`<loc>${publicBaseUrl}/tea</loc>`));
      assert.ok(xml.includes(`${publicBaseUrl}/uploads/room/tea.png`));
      assert.ok(xml.includes('Tea &amp; cake'));
    });
  }
  it('reports failed room queries without sending partial XML', async () => {
    const generate = await esmock('./generateSitemap.js', { '../models/index.js': {
      Room: { find: () => ({ lean: async () => { throw new Error('database unavailable'); } }) },
    } });
    const res = { status: sinon.stub().returnsThis(), end: sinon.stub(), send: sinon.stub() };
    await generate({}, res);
    assert.equal(res.status.firstCall.args[0], 500);
    sinon.assert.notCalled(res.send);
  });
});
