/**
 * `nemia factory rules` (`FACTORY_RULES`), what it refuses, as one table: each row refused by kind (`_tag`), exit 2 and the facts its
 * words name, writing nothing — the default factory, a name no factory has, a frontmatter block, blank words — and `--file` with
 * `--clear` refused by its check before anything is read.
 *
 * Rules read, written, printed and cleared through the command are a person's story in `test/factory-rules.test.ts`. The factory is
 * planted through the Factory door's memory layer (`factoryDoorMemory`), which the command is given: nothing here reads the disk.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import { scratch } from '../../test/scratch.ts';
import { done, doorFrom } from '../../test/door-walks.ts';
import { aFactory } from '../../test/factory-walks.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-rules-verb-');
process.env.WF_ROOT = ROOT;
const { FACTORY_RULES } = await import('./rules.verb.ts');
const { FactoryDoor } = await import('../factories/factories.store.ts');
const { FactoryName } = await import('../factory/factory.model.ts');
const { factoryDoorMemory } = await import('../factories/memory.store.ts');
const { runWith: runEngine } = await import('../runner.ts');
const { engineOf } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);

const memory = factoryDoorMemory();
const door = doorFrom(FactoryDoor, memory);
done(door.factories.create(aFactory('acme')));

/** The command run with `args`, as the CLI and the api run it, over the memory door. */
const run = (args: Args) => runWith(engineOf(engine().layer), Effect.provide(FACTORY_RULES.handler(args, undefined, ROOT), memory));

test('REFUSED: `nemia factory rules`, nothing written', async (t) => {
  const rows: Array<[string, Args, 'Conflict' | 'Missing' | 'Invalid', string[]]> = [
    ['the default factory, read', { factory: 'default' }, 'Conflict', ['`default`', 'nemia factory rules']],
    ['the default factory, written', { factory: 'default', words: 'Be kind.' }, 'Conflict', ['`default`', 'nemia factory rules']],
    ['the default factory, cleared', { factory: 'default', clear: true }, 'Conflict', ['`default`', 'nemia factory rules']],
    ['a name no factory has', { factory: 'nobody', words: 'Be kind.' }, 'Missing', ['nobody']],
    [
      'rules that open with a frontmatter block',
      { factory: 'acme', words: '---\nmodel: opus\n---\nBe kind.\n' },
      'Invalid',
      ['RULES.md', 'frontmatter', '`---`'],
    ],
    ['blank rules', { factory: 'acme', words: '   ' }, 'Invalid', ['acme']],
  ];
  for (const [row, args, tag, facts] of rows)
    await t.test(row, async () => {
      await assert.rejects(run(args), (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
        names(err.message, ...facts);
        return true;
      });
      assert.deepEqual(done(door.factories.list()), ['acme']);
      assert.equal(done(door.rules.read(FactoryName.read('acme'))).words, null);
    });
  await t.test('--file with --clear, by the check, before anything is read', () =>
    names(FACTORY_RULES.check?.({ factory: 'acme', file: 'rules.md', clear: true }), 'nemia factory rules', '--file', '--clear'),
  );
  await t.test('taken by the check: --file alone, or nothing', () => {
    assert.equal(FACTORY_RULES.check?.({ factory: 'acme', file: 'rules.md' }), null);
    assert.equal(FACTORY_RULES.check?.({ factory: 'acme' }), null);
  });
});
