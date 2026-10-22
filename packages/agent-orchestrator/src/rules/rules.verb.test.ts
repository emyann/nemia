/**
 * `nemia factory rules` (`FACTORY_RULES`), what it refuses, as one table: each row refused by kind (`_tag`), exit 2 and the facts its
 * words name, writing nothing — the default factory, a name no factory has, a frontmatter block, blank words — and `--file` with
 * `--clear` refused by its check before anything is read.
 *
 * Rules read, written, printed and cleared through the command are a person's story in `test/factory-rules.test.ts`. `WF_ROOT` is set
 * before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Args } from '../command/command.ts';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-rules-verb-');
process.env.WF_ROOT = ROOT;
const { FACTORY_RULES } = await import('./rules.verb.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { runWith: runEngine } = await import('../runner.ts');
const { engineOf } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);

const FILE = path.join(ROOT, 'factories', 'pipao', 'RULES.md');
addFactory({ name: 'pipao', repos: [fs.mkdtempSync(path.join(ROOT, 'repo-'))] });

/** The command run with `args`, as the CLI and the api run it. */
const run = (args: Args) => runWith(engineOf(engine().layer), FACTORY_RULES.handler(args));

test('REFUSED: `nemia factory rules`, nothing written', async (t) => {
  const rows: Array<[string, Args, 'Conflict' | 'Missing' | 'Invalid', string[]]> = [
    ['the default factory, read', { factory: 'default' }, 'Conflict', ['`default`', 'nemia factory rules']],
    ['the default factory, written', { factory: 'default', words: 'Be kind.' }, 'Conflict', ['`default`', 'nemia factory rules']],
    ['the default factory, cleared', { factory: 'default', clear: true }, 'Conflict', ['`default`', 'nemia factory rules']],
    ['a name no factory has', { factory: 'nobody', words: 'Be kind.' }, 'Missing', ['nobody']],
    [
      'rules that open with a frontmatter block',
      { factory: 'pipao', words: '---\nmodel: opus\n---\nBe kind.\n' },
      'Invalid',
      ['RULES.md', 'frontmatter', '`---`'],
    ],
    ['blank rules', { factory: 'pipao', words: '   ' }, 'Invalid', ['pipao']],
  ];
  for (const [row, args, tag, facts] of rows)
    await t.test(row, async () => {
      await assert.rejects(run(args), (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
        names(err.message, ...facts);
        return true;
      });
      for (const name of ['default', 'nobody']) assert.equal(fs.existsSync(path.join(ROOT, 'factories', name)), false);
      assert.equal(fs.existsSync(FILE), false);
    });
  await t.test('--file with --clear, by the check, before anything is read', () =>
    names(FACTORY_RULES.check?.({ factory: 'pipao', file: 'rules.md', clear: true }), 'nemia factory rules', '--file', '--clear'),
  );
  await t.test('taken by the check: --file alone, or nothing', () => {
    assert.equal(FACTORY_RULES.check?.({ factory: 'pipao', file: 'rules.md' }), null);
    assert.equal(FACTORY_RULES.check?.({ factory: 'pipao' }), null);
  });
});
