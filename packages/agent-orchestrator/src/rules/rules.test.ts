/**
 * A factory's rules, the pure part: where the file sits (`rulesFile`), in the store's folder for a plain factory and in its tree for one
 * made from a template, and the refusal of a file that opens with a frontmatter block (`factoryRulesRefusal`), since rules only add words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { FACTORY_RULES_FILE, factoryRulesRefusal, rulesFile } from './rules.ts';

const BOM = String.fromCharCode(0xfeff);

test('REFUSED: rules that open with a frontmatter block, after a byte order mark and with CRLF too, naming the file and the fix', () => {
  for (const text of [
    '---\nmodel: opus\n---\nBe kind.\n',
    `${BOM}---\nmodel: opus\n---\nBe kind.\n`,
    '---\r\nmodel: opus\r\n---\r\n',
    '---',
  ]) {
    const refused = factoryRulesRefusal('/store/factories/pipao/RULES.md', text);
    assert.match(refused ?? '', /^\/store\/factories\/pipao\/RULES\.md opens with a frontmatter block, a first line of `---`\./);
    assert.match(refused ?? '', /A factory's rules only add words: they set no key/);
    assert.match(refused ?? '', /start the rules with a word\.$/);
  }
});

test('rules that start with a word are taken, a line of `---` further down among them', () => {
  for (const text of ['Be kind.\n', 'Be kind.\n\n---\n\nmodel: opus\n', '--- a dash to open\n', '', `${BOM}Be kind.\n`])
    assert.equal(factoryRulesRefusal('/f/RULES.md', text), undefined, JSON.stringify(text));
});

test("the rules are RULES.md in the store's folder for the factory, and in its tree for a factory made from a template", () => {
  assert.equal(FACTORY_RULES_FILE, 'RULES.md');
  assert.equal(rulesFile({}, '/store/factories/pipao'), path.join('/store/factories/pipao', 'RULES.md'));
  assert.equal(
    rulesFile({ tree: '/store/factories/pipao/tree' }, '/store/factories/pipao'),
    path.join('/store/factories/pipao/tree', 'RULES.md'),
  );
});
