/**
 * `nemia factory cost-line set` and `rm` (`FACTORY_COST_LINE_SET`, `FACTORY_COST_LINE_RM`), as the CLI and the api run their handlers: a
 * line written into the factory, its generation moved, a second replacing the first, and taken back; and what each refuses, one table,
 * each row by kind (`_tag`) and exit 2, writing nothing. The factory is planted through the Factory door's memory layer
 * (`factoryDoorMemory`), which the command is given: nothing here reads the disk. A run freezing the line at its start, and the lines
 * typed at the command line, are a person's story in `test/factory-start.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Schema } from 'effect';
import { scratch } from 'test-kit/scratch';
import { done, doorFrom } from '../../../test/door-walks.ts';
import { aFactory, readFiled } from '../../../test/factory-walks.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../../place/memory/index.ts';
import { eachTest, runOver } from '../../../test/placed.ts';
import { FactoryDoor } from '../door/factories.store.ts';
import { factoryDoorMemory } from '../door/memory.store.ts';
import { runWith as runEngine } from '../../runner.ts';
import { engineOf } from '../../runtime-client.ts';
import type { Env } from '../../config/config.store.ts';
import type { Served } from '../../command/entry.verb.ts';
import {
  CostLineSetInput,
  FACTORY_COST_LINE_RM,
  FACTORY_COST_LINE_SET,
  type CostLineRmInput,
  type CostLineSetInput as SetInput,
} from './cost-line.verb.ts';

const ROOT = scratch('wf-cost-line-verb-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer, ENV);

/** A store in memory holding `mill`, which offers build and intake, and `bare`, which offers none. */
function planted() {
  const memory = factoryDoorMemory();
  const door = doorFrom(FactoryDoor, memory);
  done(door.factories.create(aFactory('mill', { workflows: ['build', 'intake'] })));
  done(door.factories.create(aFactory('bare')));
  const run = <D extends object, I>(command: Served<D, I>, input: I) =>
    runWith(engineOf(engine().layer), Effect.provide(command.handler(input), memory));
  return {
    door,
    set: (input: SetInput) => run(FACTORY_COST_LINE_SET, input),
    rm: (input: CostLineRmInput) => run(FACTORY_COST_LINE_RM, input),
  };
}

test('a cost line set, replaced and taken back, each write moving the generation', async (t) => {
  const { door, set, rm } = planted();
  await t.test('set: written into the factory, its generation moved', async () => {
    const before = readFiled(door, 'mill').generation ?? 1;
    const said = await set({ factory: 'mill', workflow: 'build', usd: 80 });
    assert.deepEqual([said.usd, said.replaced], [80, null]);
    const after = readFiled(door, 'mill');
    assert.deepEqual(after.costLines, { build: 80 });
    assert.equal(after.generation, before + 1);
  });
  await t.test('a second set of the workflow replaces the first, and another workflow has its own', async () => {
    assert.equal((await set({ factory: 'mill', workflow: 'build', usd: 95 })).replaced, 80);
    await set({ factory: 'mill', workflow: 'intake', usd: 5 });
    assert.deepEqual(readFiled(door, 'mill').costLines, { build: 95, intake: 5 });
  });
  await t.test('rm takes one back, and the key goes once none is left', async () => {
    await rm({ factory: 'mill', workflow: 'build' });
    assert.deepEqual(readFiled(door, 'mill').costLines, { intake: 5 });
    await rm({ factory: 'mill', workflow: 'intake' });
    assert.equal('costLines' in readFiled(door, 'mill'), false);
  });
});

test('REFUSED: `nemia factory cost-line set` and `rm`, by kind and exit 2, nothing written', async (t) => {
  const { door, set, rm } = planted();
  await set({ factory: 'mill', workflow: 'build', usd: 80 });
  const rows: Array<[string, () => Promise<unknown>, 'Invalid' | 'Missing']> = [
    ['a line of no dollars', () => set({ factory: 'mill', workflow: 'build', usd: 0 }), 'Invalid'],
    ['a line below zero', () => set({ factory: 'mill', workflow: 'build', usd: -1 }), 'Invalid'],
    ['a line that is no number', () => set({ factory: 'mill', workflow: 'build', usd: Number.NaN }), 'Invalid'],
    ['a workflow the factory does not offer', () => set({ factory: 'bare', workflow: 'build', usd: 80 }), 'Invalid'],
    ["a name that is no workflow's", () => set({ factory: 'mill', workflow: '../build', usd: 80 }), 'Invalid'],
    ['the default factory, set', () => set({ factory: 'default', workflow: 'build', usd: 80 }), 'Invalid'],
    ['the default factory, rm', () => rm({ factory: 'default', workflow: 'build' }), 'Invalid'],
    ['no such factory, set', () => set({ factory: 'nobody', workflow: 'build', usd: 80 }), 'Missing'],
    ['no such factory, rm', () => rm({ factory: 'nobody', workflow: 'build' }), 'Missing'],
    ['an rm of a line not set', () => rm({ factory: 'mill', workflow: 'intake' }), 'Missing'],
  ];
  for (const [row, act, tag] of rows)
    await t.test(row, async () => {
      await assert.rejects(act(), (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
        return true;
      });
      assert.deepEqual(readFiled(door, 'mill').costLines, { build: 80 });
      assert.equal('costLines' in readFiled(door, 'bare'), false);
    });
});

test('the command line: an amount in digits is taken and decoded to dollars; anything else is refused by the check, before anything is read', async (t) => {
  await t.test('80 and 12.50 taken, and decoded', () => {
    assert.equal(FACTORY_COST_LINE_SET.check?.({ factory: 'mill', workflow: 'build', usd: '80' }), null);
    assert.equal(Schema.decodeUnknownSync(CostLineSetInput)({ factory: 'mill', workflow: 'build', usd: '12.50' }).usd, 12.5);
  });
  for (const usd of ['abc', '0', '$80', '1e3'])
    await t.test(`REFUSED: ${usd}`, () =>
      assert.equal(typeof FACTORY_COST_LINE_SET.check?.({ factory: 'mill', workflow: 'build', usd }), 'string'),
    );
});
