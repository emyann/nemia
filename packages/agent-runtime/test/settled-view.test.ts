/**
 * A settled task's view asks no harness, whatever its harness has (`viewOf` in `service/engine.ts`).
 *
 * The orchestrator views every task of every run each pass, and a harness with no `find` (the orchestrator's `check`, which lists its
 * run files on each observe) would otherwise be observed on every view, even of a task settled days ago.
 *
 * What a sighting gives a settled view is its session's id alone (its phase is its outcome, `waitingFor` is a `needs-human` phase's,
 * `usage` an attempt in flight's), and a check's `logs` — its verdict — are read by that id. It is on the record: the handle the
 * attempt's `ended` entry names. Counted on the runtime's own meter (`io().observed`), which counts every observe.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { HarnessSpec, Sighting } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';
import { builtEngine } from './engine.ts';
import { asyncOps } from './promise-runner.ts';

/**
 * A harness shaped as the orchestrator's `check`: a command and nothing else — no `find`, no `start` — run by the engine's
 * detached worker. It prints a line and exits 3, unless its cwd holds `hold`, where it waits (bounded) until the file is gone.
 */
const check: HarnessSpec = {
  name: 'check',
  command: () => ({
    cmd: 'sh',
    args: ['-c', 'n=0; while [ -e hold ] && [ $n -lt 400 ]; do sleep 0.05; n=$((n+1)); done; echo checked; exit 3'],
  }),
};

const calls = (engine: ReturnType<typeof builtEngine>) => Effect.runSync(engine.io()).observed.check?.calls ?? 0;

/** Ticks `engine` in test `t`, every 50ms, until task `id` has settled. */
const settle = (t: Waiter, engine: ReturnType<typeof builtEngine>, id: string) =>
  until(
    t,
    async () => {
      if ((await Effect.runPromise(engine.view(id))).state.settled) return true;
      await Effect.runPromise(engine.tick());
      return false;
    },
    `${id} settled`,
    { everyMs: 50 },
  );

/** Views task `id` in test `t`, every 50ms, until its attempt runs. */
const runs = (t: Waiter, engine: ReturnType<typeof builtEngine>, id: string) => {
  let phase = 'not viewed yet';
  return until(
    t,
    async () => (phase = (await Effect.runPromise(engine.view(id))).phase).startsWith('running'),
    () => `${id} running; it is ${phase}`,
    { everyMs: 50 },
  );
};

test(
  'REFUSED at shipped defaults: a view of a settled `check` task observes nothing, and its logs are still read by the session it ended as',
  WAITED,
  async (t) => {
    const engine = builtEngine(Engine.layer({ root: scratch('ae-settled-root-'), harnesses: { check }, defaultHarness: 'check' }));
    const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-settled-cwd-') }));
    await settle(t, engine, id);

    const before = calls(engine);
    const v = await Effect.runPromise(engine.view(id));
    assert.equal(v.phase, 'failed');
    assert.equal(v.state.attempts[0]?.exitCode, 3);
    assert.equal(v.sessionId, `ae/${id}/1`, 'the handle its end was recorded under: the name a detached run goes by');
    assert.match(await Effect.runPromise(engine.logs(id)), /checked/, 'what the check printed, which is its verdict to the layer above');
    assert.equal(calls(engine) - before, 0, 'viewed, and its logs read, with no observe of the check harness');
  },
);

test('an unsettled `check` task is still observed: in flight, and before its first attempt', WAITED, async (t) => {
  const engine = builtEngine(Engine.layer({ root: scratch('ae-settled-root-'), harnesses: { check }, defaultHarness: 'check' }));
  const cwd = scratch('ae-settled-cwd-');
  fs.writeFileSync(path.join(cwd, 'hold'), '');
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd }));

  let before = calls(engine);
  assert.equal((await Effect.runPromise(engine.view(id))).phase, 'pending');
  assert.equal(calls(engine) - before, 1, 'a pending task on a harness that cannot find is observed');

  await Effect.runPromise(engine.tick());
  await runs(t, engine, id);
  before = calls(engine);
  assert.equal((await Effect.runPromise(engine.view(id))).phase, 'running (working)');
  assert.equal(calls(engine) - before, 1, "an attempt in flight is observed: its phase is its session's state");

  fs.rmSync(path.join(cwd, 'hold'));
  await settle(t, engine, id);
  before = calls(engine);
  await Effect.runPromise(engine.view(id));
  assert.equal(calls(engine) - before, 0, 'and once settled, not');
});

test('REFUSED: a settled task on a harness that has `find` observes nothing either, when the record has no native id and find finds none (a harness that names no native id and forgets a session once it is done)', async () => {
  const sessions = new Map<string, Sighting>();
  const counts = { observe: 0, find: 0 };
  const runner = {
    async spawn(r: { name: string }) {
      sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
    },
    async observe() {
      counts.observe++;
      return new Map(sessions);
    },
    async find(name: string) {
      counts.find++;
      const s = sessions.get(name);
      return s && s.state !== 'completed' ? { sessionId: s.sessionId } : undefined;
    },
    async stop() {},
    async logs(sessionId: string) {
      return `logs of ${sessionId}`;
    },
  };
  const engine = builtEngine(Engine.layer({ root: scratch('ae-settled-root-'), harnesses: { mine: asyncOps(runner) } }));
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-settled-cwd-') }));
  await Effect.runPromise(engine.tick());
  sessions.set(`ae/${id}/1`, { ...sessions.get(`ae/${id}/1`)!, state: 'completed' });
  await Effect.runPromise(engine.tick());

  const before = counts.observe;
  const v = await Effect.runPromise(engine.view(id));
  assert.equal(v.phase, 'succeeded');
  assert.equal(v.state.attempts[0]?.nativeId, null, 'nothing named a native id');
  assert.equal(v.sessionId, 's-1', 'the handle its end was recorded under');
  assert.equal(await Effect.runPromise(engine.logs(id)), 'logs of s-1');
  assert.equal(counts.observe, before, 'viewed, and its logs read, with no observe');
  assert.equal(counts.find, 2, 'asked by name once a read, and found nothing');
});

test(
  'a pass and a view of every task, as the orchestrator makes each pass: the check harness is observed once for the pass and once for each check in flight',
  WAITED,
  async (t) => {
    const engine = builtEngine(Engine.layer({ root: scratch('ae-settled-root-'), harnesses: { check }, defaultHarness: 'check' }));
    const done = await Promise.all(
      [1, 2, 3, 4, 5].map(async () => Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-settled-cwd-') }))),
    );
    for (const id of done) await settle(t, engine, id);
    const cwd = scratch('ae-settled-cwd-');
    fs.writeFileSync(path.join(cwd, 'hold'), '');
    const running = await Effect.runPromise(engine.file({ brief: 'b', cwd }));
    await Effect.runPromise(engine.tick());
    await runs(t, engine, running);

    const before = calls(engine);
    await Effect.runPromise(engine.tick());
    for (const id of [...done, running]) await Effect.runPromise(engine.view(id));
    assert.equal(calls(engine) - before, 2, 'the pass, and the one check in flight: none for the five settled');

    fs.rmSync(path.join(cwd, 'hold'));
    await settle(t, engine, running);
  },
);
