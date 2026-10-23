/**
 * The pure half of the board's markdown: which language a fenced block is highlighted in, its code, and its footnotes' label.
 * The component itself is rendered in components.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fencedCode, labelFootnotes, languageOf } from '../src/lib/markdown.ts';

test("markdown.ts: the language a fence names, a fenced block's code, and the footnotes' label", async (t) => {
  await t.test("a fence's word gives the language its block is highlighted in — as a class string or the tree's class list", () => {
    const cases: Array<[string, string]> = [
      ['ts', 'typescript'],
      ['typescript', 'typescript'],
      ['tsx', 'tsx'],
      ['js', 'tsx'],
      ['javascript', 'tsx'],
      ['jsx', 'tsx'],
      ['bash', 'bash'],
      ['sh', 'bash'],
      ['shell', 'bash'],
      ['console', 'bash'],
      ['zsh', 'bash'],
      ['md', 'markdown'],
      ['markdown', 'markdown'],
      ['json', 'json'],
      ['jsonc', 'json'],
      ['diff', 'diff'],
      ['patch', 'diff'],
      ['BASH', 'bash'],
    ];
    for (const [fence, language] of cases) {
      assert.equal(languageOf(`language-${fence}`), language, fence);
      assert.equal(languageOf([`language-${fence}`]), language, `${fence}, as a list`);
    }
    assert.equal(languageOf(['hljs', 'language-diff']), 'diff', 'another class first');
    assert.equal(languageOf('hljs language-json'), 'json');
  });
  await t.test('REFUSED: a fence the code block has no grammar for, no fence word, and no class at all are text, shown as written', () => {
    for (const className of ['language-python', 'language-', ['language-yaml'], 'hljs', '', [], undefined, null, 42]) {
      assert.equal(languageOf(className), 'text', JSON.stringify(className));
    }
  });
  await t.test("a fenced block's code is the text of its code element, less the one newline the pipeline ends it with", () => {
    const pre = {
      type: 'element',
      tagName: 'pre',
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: { className: ['language-bash'] },
          children: [
            { type: 'text', value: 'npm test\n' },
            { type: 'element', tagName: 'span', children: [{ type: 'text', value: '\nnpm run e2e\n\n' }] },
          ],
        },
      ],
    };
    assert.deepEqual(fencedCode(pre), { code: 'npm test\n\nnpm run e2e\n', className: ['language-bash'] });
    assert.deepEqual(fencedCode({ type: 'element', tagName: 'pre', children: [{ type: 'text', value: 'bare\n' }] }), {
      code: 'bare',
      className: undefined,
    });
    assert.deepEqual(fencedCode(undefined), { code: '', className: undefined });
  });
  await t.test("the footnotes' label is named with the text's prefix, and each reference is described by it — nothing else renamed", () => {
    const reference = { type: 'element', properties: { id: 'p-fnref-1', ariaDescribedBy: ['footnote-label', 'other'] }, children: [] };
    const label = { type: 'element', properties: { id: 'footnote-label', className: ['sr-only'] }, children: [] };
    const other = { type: 'element', properties: { id: 'p-fn-1' }, children: [{ type: 'text' }] };
    const tree = {
      type: 'root',
      children: [
        { type: 'element', properties: {}, children: [reference] },
        { type: 'element', properties: {}, children: [label, other] },
      ],
    };
    labelFootnotes('p-')(tree);
    assert.deepEqual(reference.properties, { id: 'p-fnref-1', ariaDescribedBy: ['p-footnote-label', 'other'] });
    assert.deepEqual(label.properties, { id: 'p-footnote-label', className: ['sr-only'] });
    assert.deepEqual(other.properties, { id: 'p-fn-1' });
  });
});
