import { sanitizeRichText } from './rich-text';

describe('rich text sanitization', () => {
  it('keeps text, tables and an inline HTTPS image', () => {
    const body =
      '<p>Before</p><img src="https://example.com/image.png" alt="Image" /><p>After</p><table><tr><td>Cell</td></tr></table>';
    const clean = sanitizeRichText(body);
    expect(clean).toContain('<p>Before</p>');
    expect(clean).toContain('src="https://example.com/image.png"');
    expect(clean).toContain('<p>After</p>');
    expect(clean).toContain('<td>Cell</td>');
  });
  it('removes scripts, handlers, embeds, styles and unsafe URLs', () => {
    const clean = sanitizeRichText(
      '<script>alert(1)</script><p onclick="evil()" style="color:red">Safe</p><img src="javascript:evil()"><img src="//evil.test/a"><img src="data:image/svg+xml,bad"><iframe src="https://example.com"></iframe><a href="javascript:evil()">Bad</a>',
    );
    expect(clean).toBe('<p>Safe</p>');
  });
});
