/**
 * A task filed `restartPolicy: 'Always'` on the command harness is started again after its process ends, once the back-off has gone,
 * and a stop settles it `stopped` with no attempt after it: the restart a long-lived program of a factory rests on. The monotonic clock
 * is stepped past `RESTART_BACKOFF`, never waited for.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { Journal } from '../src/core/engine/journal.ts';
import { tick } from '../src/core/engine/index.ts';
import { file, requestStop } from '../src/core/engine/filing.ts';
import { tickMemoLayer } from '../src/core/engine/memo.ts';
import { fold, nameFor, RESTART_BACKOFF, type Sighting } from '../src/core/domain.ts';
import { composite, Runner, testOps } from '../src/harness/seam.ts';
import { TaskId } from '../src/core/model.ts';
import { stepMono } from './clock.ts';

test('a command task filed to run always gets a second attempt after its process ends, and none after a stop', async (t) => {
  const sessions = new Map<string, Sighting>();
  const runner = Runner.layer(composite({ cmd: testOps({ sessions }) }, 'cmd'));
  const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const state = async (id: string) => fold(id, await run(Effect.flatMap(Journal, (j) => j.read(TaskId.read(id)))));

  const id = await run(file({ brief: 'keep it', cwd: '/r', harness: 'cmd', restartPolicy: 'Always', id: 'always' }));
  await run(tick());
  const first = sessions.get(nameFor(id, 1));
  assert.ok(first, 'the first attempt spawned');
  sessions.set(nameFor(id, 1), { ...first, state: 'completed' });
  await run(tick());
  assert.equal((await state(id)).settled, null, 'the process’s end is not the task’s');
  stepMono(t, RESTART_BACKOFF.initialMs + 10_000);
  await run(tick());
  assert.equal((await state(id)).attempts.length, 2, 'started again once the back-off had gone');

  await run(requestStop(TaskId.read(id)));
  await run(tick());
  stepMono(t, RESTART_BACKOFF.initialMs * 4 + 10_000);
  await run(tick());
  const stopped = await state(id);
  assert.deepEqual([stopped.settled, stopped.attempts.length], ['stopped', 2], 'a stop settles it, and no third attempt follows');
});
