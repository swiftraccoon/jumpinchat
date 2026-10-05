import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import pug from 'pug';

describe('server-rendered template compatibility', () => {
  it('renders the room through the EJS 7 Express callback interface', async () => {
    const filename = fileURLToPath(new URL('../../react-client/index.ejs', import.meta.url));
    const html = await new Promise((resolve, reject) => ejs.renderFile(filename, {
      settings: { views: fileURLToPath(new URL('../../react-client', import.meta.url)), 'view cache': false },
      roomTitle: 'Chat <room> & friends', roomDescription: 'A room', roomDisplay: '/image.png',
      room: { name: 'test', attrs: {} }, sentryDsn: '', supportEnabled: false, initialAccountDarkTheme: false,
    }, (error, rendered) => error ? reject(error) : resolve(rendered)));
    assert.ok(html.includes('<title>Chat &lt;room&gt; &amp; friends</title>'));
    assert.ok(html.includes('var accountTheme = false;'));
    assert.ok(html.includes('/test/manifest.json'));
  });

  it('renders the not-found page using the bundled Font Awesome 7 assets', () => {
    const html = pug.renderFile(fileURLToPath(new URL('./404.pug', import.meta.url)));
    assert.ok(html.includes('href="/fontawesome/css/all.min.css"'));
    assert.ok(html.includes('fa-brands fa-twitter'));
    assert.ok(!html.includes('maxcdn.bootstrapcdn.com'));
  });
});
