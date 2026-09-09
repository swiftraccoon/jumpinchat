import assert from 'node:assert/strict';
import sinon from 'sinon';
import esmock from 'esmock';

describe('sitemap API compatibility', () => {
  it('renders absolute room and image URLs with escaped text using Sitemap 9', async () => {
    const generate = await esmock('./generateSitemap.js', { '../models/index.js': {
      Room: { find: () => ({ lean: async () => [{ name: 'tea', settings: {
        display: 'room/tea.png', description: 'Tea & cake',
      } }] }) },
    } });
    const res = { header: sinon.stub().returnsThis(), status: sinon.stub().returnsThis(), send: sinon.stub() };
    await generate({}, res);
    assert.equal(res.status.firstCall.args[0], 200);
    const xml = res.send.firstCall.args[0];
    assert.ok(xml.includes('<loc>https://jumpin.chat/tea</loc>'));
    assert.ok(xml.includes('https://jumpin.chat/uploads/room/tea.png'));
    assert.ok(xml.includes('Tea &amp; cake'));
  });
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
