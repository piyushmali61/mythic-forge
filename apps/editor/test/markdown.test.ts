import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.ts';

describe('renderMarkdown', () => {
  it('renders the supported subset', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** and *em* and `code`.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<td>1</td>');
  });

  it('escapes HTML and neutralises script injection', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('only links to https and internal docs', () => {
    const html = renderMarkdown('[a](https://example.org) [b](javascript:alert(1)) [c](doc:getting-started) [d](http://insecure.example)');
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('data-doc="getting-started"');
    expect(html).not.toContain('http://insecure');
  });

  it('does not treat snake_case as emphasis and keeps code verbatim', () => {
    const html = renderMarkdown('Use `asset_meta_json` and file_name_here.');
    expect(html).toContain('<code>asset_meta_json</code>');
    expect(html).toContain('file_name_here');
    expect(html).not.toContain('<em>');
  });

  it('escapes code blocks', () => {
    const html = renderMarkdown('```\n<b>not bold</b>\n```');
    expect(html).toBe('<pre><code>&lt;b&gt;not bold&lt;/b&gt;</code></pre>');
  });
});
