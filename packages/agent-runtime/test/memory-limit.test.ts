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
import { scratch } from 'test-kit/scratch';
import { builtEngine } from './engine.ts';
import { story } from 'test-kit/checkpoints';
import { until, WAITED } from '../src/waits/index.ts';
import type { Event } from '../src/index.ts';
import { asyncStore, type AsyncJournal } from './promise-runner.ts';

/**
 * A journal an older runtime wrote and died in the window between `starting` and `spawned`: its task filed with a limit of its own,
 * its attempt's `starting` entry carrying no `resources`, as no runtime before the defaults moved to `start` journalled them.
 */
const olderJournal = (taskId: string, cwd: string): AsyncJournal => {
  const at = new Date().toISOString();
  const tasks = new Map<string, Event[]>([
    [
      taskId,
      [
        {
          kind: 'filed',
          at,
          brief: 'run it',
          cwd,
          harness: 'command',
          config: { command: ['true'] },
          resources: { limits: { memory: '64Mi' } },
        },
        { kind: 'starting', at, attempt: 1 },
      ],
    ],
  ]);
  const feed: Array<{ taskId: string; event: Event }> = [];
  return {
    async append(id, event) {
      tasks.set(id, [...(tasks.get(id) ?? []), event]);
      feed.push({ taskId: id, event });
    },
    async read(id) {
      return [...(tasks.get(id) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

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
    const olderRoot = scratch('ae-memory-older-');
    const older = builtEngine(
      EngineService.layer({
        root: olderRoot,
        journal: asyncStore(olderJournal('t-older', cwd)),
        harnesses: { command: detachedOps(commandHarness, olderRoot, { scopeProgram: 'false' }) },
      }),
    );
    const state = async (on: typeof engine, id: string) => (await Effect.runPromise(on.view(id))).state;

    await s.test('every task settles', async (sub) => {
      await until(
        sub,
        async () => {
          await Effect.runPromise(engine.tick());
          await Effect.runPromise(defaulted.tick());
          await Effect.runPromise(older.tick());
          return (
            (await state(older, 't-older')).settled !== null &&
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
      assert.equal(limited.resources, undefined, 'none written on its filing');
      assert.deepEqual(limited.attempts[0]?.resources, { limits: { memory: '64Mi' } }, 'the default its attempt started under');
      assert.deepEqual([limited.settled, limited.attempts[0]?.reason], ['failed', 'unstartable']);
    });

    await s.test(
      'an attempt an older runtime started, its `starting` entry with no resources, spawns under the limit it was filed with',
      async () => {
        const upgraded = await state(older, 't-older');
        assert.deepEqual(upgraded.resources, { limits: { memory: '64Mi' } }, 'the limit its filing carries');
        assert.equal(upgraded.attempts[0]?.resources, undefined, 'none on its `starting` entry');
        assert.deepEqual(
          [upgraded.settled, upgraded.attempts[0]?.reason],
          ['failed', 'unstartable'],
          'its spawn asked for a limit, which only a scope holds, and was refused',
        );
        assert.ok(upgraded.attempts[0]?.error, 'the refusal is on the attempt');
      },
    );

    await s.test('a task with no limit spawns plainly and succeeds, carrying no memory', async () => {
      const plain = await state(engine, ids.plain);
      assert.deepEqual([plain.settled, plain.attempts[0]?.exitCode], ['succeeded', 0]);
      assert.equal(plain.attempts[0]?.memory, undefined);
    });
  },
);
