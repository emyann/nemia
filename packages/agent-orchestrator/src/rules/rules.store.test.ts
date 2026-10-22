/**
 * A factory's rules on disk (`rules.store.ts`), as tables: what a write refuses — blank words, a frontmatter block, a bad name, a tree not
 * rendered yet — each row refused by kind (`_tag`), exit 2 and the facts its words name, writing nothing; and what a read of a factory's
 * workflow folder is handed (`factoryFills`), two focused tests.
 *
 * Rules written, read back, told and cleared are a person's story in `test/factory-rules.test.ts`; the guards a rules file is read
 * through (a link, a directory, a frontmatter block), shared with the instruction's, in `../factory/instruction.store.test.ts`; the
 * folder gone with its factory, in `test/factory-start.test.ts`. `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-rules-store-');
process.env.WF_ROOT = ROOT;
const { factoryFills, readRules, rulesAt, rulesFolder, writeRules } = await import('./rules.store.ts');

/** Refused by kind, exit 2, and the facts its words name — never its sentence. */
const refused =
  (tag: 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    names(err.message, ...facts);
    return true;
  };

const PIPAO = { name: 'pipao' };
const FILE = path.join(ROOT, 'factories', 'pipao', 'RULES.md');

test('REFUSED: a write of the rules, nothing written', async (t) => {
  const tree = path.join(ROOT, 'factories', 'made', 'tree');
  const rows: Array<[string, () => unknown, 'Conflict' | 'Invalid', string[]]> = [
    ['blank rules, naming the clear', () => writeRules(PIPAO, ' \n '), 'Invalid', ['pipao', 'nemia factory rules pipao --clear']],
    [
      'rules that open with a frontmatter block',
      () => writeRules(PIPAO, '---\nallowedTools: Bash\n---\nUse Bash.\n'),
      'Invalid',
      ['RULES.md', 'frontmatter'],
    ],
    ['a name that is no slug', () => rulesFolder('../up'), 'Invalid', ['`../up`']],
    [
      'a templated factory whose tree is not rendered yet, naming the tree, nemia up and nemia factory ls',
      () => writeRules({ name: 'made', tree }, 'Be kind.'),
      'Conflict',
      ['made', tree, 'nemia up', 'nemia factory ls'],
    ],
  ];
  for (const [row, act, tag, facts] of rows)
    await t.test(row, () => {
      assert.throws(act, refused(tag, ...facts));
      assert.deepEqual([fs.existsSync(FILE), fs.existsSync(tree)], [false, false]);
    });
  await t.test('once the tree is rendered, the rules are written in it', () => {
    fs.mkdirSync(tree, { recursive: true });
    assert.equal(writeRules({ name: 'made', tree }, 'Be kind.'), path.join(tree, 'RULES.md'));
    assert.deepEqual(readRules(rulesAt({ name: 'made', tree })), { words: 'Be kind.', error: null });
  });
});

test("a factory's fills for a workflow: its hires into that workflow alone, and its rules where they are told", () => {
  const factory = { name: 'filled', hires: { 'build/design': 'seldon', 'build/review': 'agora', 'other/step': 'zed' } };
  const agents = { design: 'seldon', review: 'agora' };
  assert.deepEqual(factoryFills(factory, 'build'), { fills: { factory: 'filled', workflow: 'build', agents }, error: null });
  assert.deepEqual(factoryFills(factory, 'none').fills.agents, {});
  writeRules(factory, 'Never push on a Friday.');
  assert.deepEqual(factoryFills(factory, 'build'), {
    fills: { factory: 'filled', workflow: 'build', agents, rules: 'Never push on a Friday.' },
    error: null,
  });
});

test('REFUSED: rules that cannot be told are left out of the fills, and why is said: a frontmatter block, and a link', () => {
  const factory = { name: 'untold', hires: { 'build/design': 'seldon' } };
  const file = rulesAt(factory);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\nharness: claude\n---\nNever push.\n');
  const block = factoryFills(factory, 'build');
  assert.deepEqual(block.fills, { factory: 'untold', workflow: 'build', agents: { design: 'seldon' } });
  assert.match(block.error ?? '', /opens with a frontmatter block/);
  const outside = path.join(ROOT, 'untold-elsewhere.md');
  fs.writeFileSync(outside, 'Words from elsewhere.\n');
  fs.rmSync(file);
  fs.symlinkSync(outside, file);
  const link = factoryFills(factory, 'build');
  assert.equal('rules' in link.fills, false);
  assert.match(link.error ?? '', /is a link/);
});
