/**
 * A factory's rules, the pure part, as one table: where the file sits (`rulesFile`), in the store's folder for a plain factory and in
 * its tree for one made from a template, and the refusal of a file that opens with a frontmatter block (`factoryRulesRefusal`), since
 * rules only add words — each refused row naming the file and the fix, never its sentence.
 *
 * The rules on disk are in `rules.store.test.ts`, `rules.verb.test.ts` and `../factory/instruction.store.test.ts`; told to a run, in
 * `test/factory-rules.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { names } from '../../test/assessed.ts';
import { FACTORY_RULES_FILE, factoryRulesRefusal, rulesFile } from './rules.ts';

const BOM = String.fromCharCode(0xfeff);

test('factoryRulesRefusal and rulesFile: rules are RULES.md beside the factory, and start with a word', async (t) => {
  const refusedRows: Array<[string, string]> = [
    ['a frontmatter block', '---\nmodel: opus\n---\nBe kind.\n'],
    ['a frontmatter block after a byte order mark', `${BOM}---\nmodel: opus\n---\nBe kind.\n`],
    ['a frontmatter block with CRLF', '---\r\nmodel: opus\r\n---\r\n'],
    ['a first line of `---` alone', '---'],
  ];
  for (const [row, text] of refusedRows)
    await t.test(`REFUSED: ${row}, naming the file and the fix`, () => {
      const refused = factoryRulesRefusal('/store/factories/pipao/RULES.md', text);
      assert.ok(refused?.startsWith('/store/factories/pipao/RULES.md '), refused ?? 'not refused');
      names(refused, 'frontmatter', '`---`');
    });
  for (const text of ['Be kind.\n', 'Be kind.\n\n---\n\nmodel: opus\n', '--- a dash to open\n', '', `${BOM}Be kind.\n`])
    await t.test(`taken: ${JSON.stringify(text)}`, () => assert.equal(factoryRulesRefusal('/f/RULES.md', text), undefined));
  await t.test("the file is RULES.md in the store's folder for the factory", () => {
    assert.equal(FACTORY_RULES_FILE, 'RULES.md');
    assert.equal(rulesFile({}, '/store/factories/pipao'), path.join('/store/factories/pipao', 'RULES.md'));
  });
  await t.test('and in its tree, for a factory made from a template', () =>
    assert.equal(
      rulesFile({ tree: '/store/factories/pipao/tree' }, '/store/factories/pipao'),
      path.join('/store/factories/pipao/tree', 'RULES.md'),
    ),
  );
});
