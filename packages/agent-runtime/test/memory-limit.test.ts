/**
 * A task's memory limit on a host that cannot hold one: the detached runner asks `scopeRefusal` of the program that makes a scope, and
 * where it refuses, a limited task's spawn is refused, so its attempt ends `unstartable` and no run file is written for it; a task with
 * no limit spawns as it always did, the program never asked. The program here is `false`, which refuses every probe, so the story holds
 * on any host; `memory-limit.boundary.test.ts` holds the limit on a real cgroup.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine as EngineService } from '../src/index.ts';
import { commandHarness } from '../src/harness/command/command.ts';
import { detachedOps } from '../src/harness/detached/detached.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';
import { until, WAITED } from '../src/waits/index.ts';

test(
  'a host that makes no scope: a limited task, its own limit or the default, ends unstartable with no run file; an unlimited one runs',
  WAITED,
  async (t) => {
    const s = story(t);
    const root = scratch('ae-memory-limit-');
    const cwd = scratch('ae-memory-limit-cwd-');
    const command = detachedOps(commandHarness, root, { scopeProgram: 'false' });
    const engine = builtEngine(EngineService.layer({ root, harnesses: { command } }));
    const defaulted = builtEngine(
      EngineService.layer({ root: scratch('ae-memory-default-'), harnesses: { command }, defaultLimits: { memory: '64Mi' } }),
    );
    const file = (on: typeof engine, resources?: { limits: { memory: string } }) =>
      Effect.runPromise(
        on.file({ brief: 'run it', cwd, harness: 'command', config: { command: ['true'] }, ...(resources ? { resources } : {}) }),
      );
    const ids = { limited: await file(engine, { limits: { memory: '64Mi' } }), plain: await file(engine) };
    const fromDefault = await file(defaulted);
    const state = async (on: typeof engine, id: string) => (await Effect.runPromise(on.view(id))).state;

    await s.test('every task settles', async (sub) => {
      await until(
        sub,
        async () => {
          await Effect.runPromise(engine.tick());
          await Effect.runPromise(defaulted.tick());
          return (
            (await state(engine, ids.limited)).settled !== null &&
            (await state(engine, ids.plain)).settled !== null &&
            (await state(defaulted, fromDefault)).settled !== null
          );
        },
        'every task settled',
        { everyMs: 50 },
      );
    });

    await s.test("a task with a limit of its own ends unstartable, the probe's refusal its error, and no run file is written", async () => {
      const limited = await state(engine, ids.limited);
      assert.deepEqual([limited.settled, limited.attempts[0]?.reason], ['failed', 'unstartable']);
      assert.ok(limited.attempts[0]?.error, 'the refusal is on the attempt');
      const runs = path.join(root, 'runs', commandHarness.name);
      assert.deepEqual(
        fs.readdirSync(runs).filter((f) => f.includes(ids.limited)),
        [],
        'nothing of the limited run is on disk',
      );
    });

    await s.test('a task filed with none on an engine with a default takes the default, and ends unstartable the same', async () => {
      const limited = await state(defaulted, fromDefault);
      assert.deepEqual(limited.resources, { limits: { memory: '64Mi' } });
      assert.deepEqual([limited.settled, limited.attempts[0]?.reason], ['failed', 'unstartable']);
    });

    await s.test('a task with no limit spawns plainly and succeeds, carrying no memory', async () => {
      const plain = await state(engine, ids.plain);
      assert.deepEqual([plain.settled, plain.attempts[0]?.exitCode], ['succeeded', 0]);
      assert.equal(plain.attempts[0]?.memory, undefined);
    });
  },
);
