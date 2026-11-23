import sanitizeHtml from 'sanitize-html';

/** Only HTTP(S) media/links; no scripts, inline styles or event attributes. */
export function sanitizeRichText(body: string): string {
  return sanitizeHtml(body, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
    ],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'] },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      (frame.tag === 'img' && !/^https?:\/\//i.test(frame.attribs.src ?? '')) ||
      (frame.tag === 'a' && !/^https?:\/\//i.test(frame.attribs.href ?? '')),
  });
}
