/**
 * The board's markdown components (`src/components/markdown/`), rendered to markup as a server renders them: what a
 * person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { Markdown } = await import('../src/components/markdown/Markdown.tsx');

/** A text, as the board renders it. */
const md = (text: string): string => renderToStaticMarkup(createElement(Markdown, null, text));

test('markdown is drawn as GFM: headings two levels down, lists, a table, a task list, strikethrough, an autolink and a footnote', () => {
  const html = md(
    [
      '# Title',
      '## What it needs',
      '###### Deepest',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '| file | lines |',
      '|:--|--:|',
      '| a.ts | 12 |',
      '',
      '- [x] done',
      '- [ ] to do',
      '',
      '~~gone~~ and www.example.com',
      '',
      'A claim[^1].',
      '',
      '[^1]: Its source.',
    ].join('\n'),
  );
  assert.match(html, /^<div data-markdown="true"/);
  assert.match(html, /<h3[^>]*>Title<\/h3>/, '`#` is an h3: the page has its own h1 and h2');
  assert.match(html, /<h4[^>]*>What it needs<\/h4>/);
  assert.match(html, /<h6[^>]*>Deepest<\/h6>/, 'and nothing goes past h6');
  assert.doesNotMatch(html, /<h[12][\s>]/);
  assert.match(html, /<ul[^>]*>\s*<li[^>]*>one<\/li>\s*<li[^>]*>two<\/li>\s*<\/ul>/);
  assert.match(html, /<ol[^>]*>\s*<li[^>]*>first<\/li>/);
  assert.match(
    html,
    /<div class="[^"]*overflow-x-auto[^"]*"><table[^>]*><thead><tr><th[^>]*style="text-align:left"[^>]*>file<\/th><th[^>]*style="text-align:right"[^>]*>lines<\/th>/,
    'a table, in a box that scrolls sideways',
  );
  assert.match(html, /<td[^>]*>a\.ts<\/td><td[^>]*>12<\/td>/);
  assert.match(html, /<input type="checkbox" disabled=""[^>]*checked=""\/> done/, 'a task done, its box not to be ticked from the board');
  assert.match(html, /<input type="checkbox" disabled=""[^>]*\/> to do/);
  assert.match(html, /<del>gone<\/del>/);
  assert.match(html, /<a href="http:\/\/www\.example\.com" target="_blank"/);
  assert.match(html, /<section data-footnotes="true"/);
  assert.match(html, /Its source\./);
});

test('a link opens in a new tab and gives the page it opens nothing of this one; a footnote link stays in the tab', () => {
  const html = md('See [the docs](https://example.com/docs) and a note[^n].\n\n[^n]: Here.');
  assert.match(html, /<a href="https:\/\/example\.com\/docs" target="_blank" rel="noreferrer noopener"[^>]*>the docs<\/a>/);
  const internal = [...html.matchAll(/<a href="#[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.equal(internal.length, 2, 'the reference and the way back');
  for (const a of internal) assert.doesNotMatch(a, /target=/, a);
});

test('REFUSED: raw HTML in a text is shown as the text it is — no element is made of it, inline or as a block', () => {
  const html = md(
    'Before <b>bold</b> <img src=x onerror="alert(1)"> after.\n\n<script>alert(1)</script>\n\n<div onclick="alert(1)">a block</div>\n\n<a href="https://example.com">a tag</a>',
  );
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;div onclick=&quot;alert\(1\)&quot;&gt;a block&lt;\/div&gt;/);
  for (const element of ['b', 'img', 'script', 'div onclick', 'a href="https://example.com">a tag']) {
    assert.ok(!html.includes(`<${element}`), `no <${element}> element`);
  }
});

test('REFUSED: a link whose address could run script is its words and no link; an image is a link to it, never fetched', () => {
  for (const address of ['javascript:alert(1)', 'JavaScript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>']) {
    const html = md(`[click me](${address}) and <${address}>`);
    assert.match(html, /click me/, address);
    assert.doesNotMatch(html, /href="[^"]*(script|data):/i, address);
    assert.doesNotMatch(html, /<a[^>]*>click me<\/a>/, `${address}: its words, not a link`);
  }
  const image = md('![the diagram](https://example.com/d.png) and ![](javascript:alert(1))');
  assert.doesNotMatch(image, /<img/);
  assert.match(
    image,
    /<a href="https:\/\/example\.com\/d\.png" target="_blank" rel="noreferrer noopener" data-image="true"[^>]*>image: the diagram<\/a>/,
  );
  assert.match(image, /<span data-image="true">image<\/span>/, 'an image whose address was emptied is a word');
});

test("a fenced block is the board's code block in its fence's language; one it has no grammar for is text; inline code is inline", () => {
  const html = md('Run `npm test`:\n\n```bash\nnpm test\nnpm run e2e\n```\n\n```python\nprint(1)\n```\n\n```\nplain\n```');
  assert.match(html, /data-language="bash"[^>]*>.*<code>npm test\nnpm run e2e<\/code>/s, 'the code, less the newline the block ends with');
  assert.match(html, /data-language="text"[^>]*>.*<code>print\(1\)<\/code>/s);
  assert.equal([...html.matchAll(/data-language=/g)].length, 3);
  assert.match(html, /Run <code class="[^"]*font-mono[^"]*">npm test<\/code>:/);
});

test('two texts with footnotes on one page name theirs apart — no id twice, each reference to its own note', () => {
  const html = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement(Markdown, null, 'One[^1].\n\n[^1]: First.'),
      createElement(Markdown, null, 'Two[^1].\n\n[^1]: Second.'),
    ),
  );
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 6, 'a reference, a label and a note, in each');
  assert.equal(new Set(ids).size, ids.length, `no id twice: ${ids.join(', ')}`);
  for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(href), `#${href} names an element on the page`);
  for (const [, label] of html.matchAll(/aria-describedby="([^"]+)"/g))
    assert.ok(ids.includes(label), `${label} names an element on the page`);
});

test('given a level, `#` is drawn as that heading and deeper ones follow it, sized by their own level and never past h6', () => {
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const panel = renderToStaticMarkup(createElement(Markdown, { level: 5, children: '# A\n## B\n### C' }));
  assert.match(panel, /<h5 class="[^"]*text-\[1\.15em\][^"]*">A<\/h5>/, "a text's `#` keeps its size in a panel");
  assert.match(panel, /<h6 class="[^"]*text-\[1\.08em\][^"]*">B<\/h6>/);
  assert.match(panel, /<h6[^>]*>C<\/h6>/);
  assert.doesNotMatch(panel, /<h[1-4][\s>]/, "no heading outranks the panel's own");
  assert.match(md('# A\n## B'), /<h3[^>]*>A<\/h3>\s*<h4[^>]*>B<\/h4>/, 'without a level, `#` is an h3');
});

test('a code block keeps its lines as written: a long one scrolls inside the block, never wraps', () => {
  const html = md('```\n' + 'x'.repeat(300) + '\n```');
  const block = /<div class="([^"]*)" data-language="text"/.exec(html);
  assert.ok(block, html);
  assert.match(block[1], /(^|\s)\[&amp;_pre\]:whitespace-pre(\s|$)/, 'its lines are not wrapped');
});

test('a soft line break joins its lines into one paragraph, and nothing around a text keeps its breaks', () => {
  const html = md('one\ntwo\n\nthree');
  assert.match(html, /<p[^>]*>one\ntwo<\/p>\s*<p[^>]*>three<\/p>/);
  assert.doesNotMatch(html, /whitespace-pre|<br/);
});
