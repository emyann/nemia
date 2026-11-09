/**
 * The sessions' drain holds a parked job only on a harness that declares `drain` (`drainHolds`, `SessionsDrained`, `Now.drained` per
 * task): a job parked on Claude Code waits while it stands, and one on a harness that declares no drain is continued on its back-off,
 * its deadline counted on. `decide` is unchanged: the pass hands it, task by task, whether the drain holds that task.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { Journal } from '../src/core/engine/journal.ts';
import { file, tick } from '../src/core/engine/index.ts';
import { SessionsDrained } from '../src/core/engine/engine.ts';
import { tickMemoLayer } from '../src/core/engine/memo.ts';
import { fold, nameFor, RESTART_BACKOFF, type Sighting } from '../src/core/domain.ts';
import { composite, Runner, testOps } from '../src/harness/seam.ts';
import { commandHarness } from '../src/index.ts';
import { drainHolds } from '../src/service/drain.ts';
import type { HarnessConfig } from '../src/service/options.ts';
import { TaskId } from '../src/core/model.ts';
import { stepMono } from './clock.ts';

test('a parked job on a harness declaring `drain` is held while the drain stands; one on a harness that does not is continued', async (t) => {
  const sessions = new Map<string, Sighting>();
  const configs: Record<string, HarnessConfig> = { claude: 'claude', cmd: commandHarness };
  const runner = Runner.layer(composite({ claude: testOps({ sessions }), cmd: testOps({ sessions }) }, 'claude'));
  const drained = Layer.succeed(SessionsDrained)(() => drainHolds(true, configs, 'claude'));
  const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }), drained);
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const attempts = async (id: string) => fold(id, await run(Effect.flatMap(Journal, (j) => j.read(TaskId.read(id))))).attempts.length;

  const held = await run(file({ brief: 'b', cwd: '/r', harness: 'claude', id: 'on-claude' }));
  const goes = await run(file({ brief: 'b', cwd: '/r', harness: 'cmd', id: 'on-cmd' }));
  await run(tick());
  for (const id of [held, goes]) {
    const name = nameFor(id, 1);
    const seen = sessions.get(name);
    assert.ok(seen, `${name} spawned`);
    sessions.set(name, { ...seen, state: 'completed', parked: {} });
  }
  await run(tick());
  stepMono(t, RESTART_BACKOFF.initialMs + 10_000);
  await run(tick());
  assert.deepEqual([await attempts(held), await attempts(goes)], [1, 2], 'Claude Code’s held, the command’s continued');
});
