import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown.js';

describe('Markdown rendering with the current parser', () => {
  it('preserves formatting, links and ordinary images', () => {
    const html = renderMarkdown('**Hello** [profile](/profile/user)\n\n![avatar](https://example.test/avatar.png)');
    assert.match(html, /<strong>Hello<\/strong>/);
    assert.match(html, /href="\/profile\/user"/);
    assert.match(html, /src="https:\/\/example.test\/avatar.png"/);
  });
  it('removes active HTML while preserving surrounding text', () => {
    const html = renderMarkdown('Before <script>removed()</script><iframe src="https://example.test"></iframe> after');
    assert.ok(html.includes('Before'));
    assert.ok(html.includes('after'));
    assert.ok(!html.includes('<script'));
    assert.ok(!html.includes('<iframe'));
    assert.ok(!html.includes('removed()'));
  });
  it('does not allow arbitrary attributes or embedded image data', () => {
    const html = renderMarkdown('<p id="unexpected" style="color:red">Text</p><img src="data:image/png;base64,AA==" alt="avatar">');
    assert.ok(!html.includes('id='));
    assert.ok(!html.includes('style='));
    assert.ok(!html.includes('data:'));
    assert.ok(html.includes('Text'));
    assert.ok(html.includes('alt="avatar"'));
  });
  it('handles an empty profile without generating markup', () => {
    assert.equal(renderMarkdown(undefined), '');
    assert.equal(renderMarkdown(''), '');
  });
});
