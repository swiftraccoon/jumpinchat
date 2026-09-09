import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

// Marked parses Markdown; its former `sanitize` option no longer filters HTML.
// Keep ordinary formatting and images while removing executable markup.
export function renderMarkdown(source) {
  if (typeof source !== 'string' || !source) return '';
  return sanitizeHtml(marked.parse(source), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      th: ['align'],
      td: ['align'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
  });
}
