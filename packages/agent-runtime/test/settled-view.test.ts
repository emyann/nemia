/**
 * A settled task's view asks no harness, whatever its harness has (`viewOf` in `facade.ts`).
 *
 * Measured on 2026-09-25 with the tick's meter (`wf up --stats`, 192 runs in the store): a pass made 183 observes, 171 of them the
 * `check` harness, each listing about 300 run files — 52,497 listings and about 1.5 s a pass, every 4 s. A harness with no `find`
 * was observed on every view, even of a task settled days ago, and the orchestrator views every task of every run each pass.
 *
 * What a sighting gave a settled view was its session's id alone (its phase is its outcome, `waitingFor` is a `needs-human`
 * phase's, `usage` an attempt in flight's), and a check's `logs` — its verdict — are read by that id. It is on the record: the
 * handle the attempt's `ended` entry names. Counted on the runtime's own meter (`io().observed`), which counts every observe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createEngine, type HarnessSpec, type Sighting } from '../src/facade.ts';
import { scratch } from './scratch.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A harness shaped as the orchestrator's `check`: a command and nothing else — no `find`, no `nativeIdPattern` — run by the engine's
 * detached worker. It prints a line and exits 3, unless its cwd holds `hold`, where it waits (bounded) until the file is gone.
 */
const check: HarnessSpec = {
  name: 'check',
  command: () => ({ cmd: 'sh', args: ['-c', 'n=0; while [ -e hold ] && [ $n -lt 400 ]; do sleep 0.05; n=$((n+1)); done; echo checked; exit 3'] }),
};

const calls = (engine: ReturnType<typeof createEngine>) => engine.io().observed.check?.calls ?? 0;

const settle = async (engine: ReturnType<typeof createEngine>, id: string) => {
  const until = Date.now() + 20_000;
  while (!(await engine.view(id)).state.settled) {
    assert.ok(Date.now() < until, `${id} settled`);
    await engine.tick();
    await sleep(50);
  }
};

test('REFUSED at shipped defaults: a view of a settled `check` task observes nothing, and its logs are still read by the session it ended as', async () => {
  const engine = createEngine({ root: scratch('ae-settled-root-'), harnesses: { check }, defaultHarness: 'check' });
  const id = await engine.file({ brief: 'b', cwd: scratch('ae-settled-cwd-') });
  await settle(engine, id);

  const before = calls(engine);
  const v = await engine.view(id);
  assert.equal(v.phase, 'failed');
  assert.equal(v.state.attempts[0]?.exitCode, 3);
  assert.equal(v.sessionId, `ae/${id}/1`, 'the handle its end was recorded under: the name a detached run goes by');
  assert.match(await engine.logs(id), /checked/, 'what the check printed, which is its verdict to the layer above');
  assert.equal(calls(engine) - before, 0, 'viewed, and its logs read, with no observe of the check harness');
});

test('an unsettled `check` task is still observed: in flight, and before its first attempt', async () => {
  const engine = createEngine({ root: scratch('ae-settled-root-'), harnesses: { check }, defaultHarness: 'check' });
  const cwd = scratch('ae-settled-cwd-');
  fs.writeFileSync(path.join(cwd, 'hold'), '');
  const id = await engine.file({ brief: 'b', cwd });

  let before = calls(engine);
  assert.equal((await engine.view(id)).phase, 'pending');
  assert.equal(calls(engine) - before, 1, 'a pending task on a harness that cannot find is observed');

  await engine.tick();
  const until = Date.now() + 20_000;
  while (!(await engine.view(id)).phase.startsWith('running')) {
    assert.ok(Date.now() < until, 'the check runs');
    await sleep(50);
  }
  before = calls(engine);
  assert.equal((await engine.view(id)).phase, 'running (working)');
  assert.equal(calls(engine) - before, 1, 'an attempt in flight is observed: its phase is its session\'s state');

  fs.rmSync(path.join(cwd, 'hold'));
  await settle(engine, id);
  before = calls(engine);
  await engine.view(id);
  assert.equal(calls(engine) - before, 0, 'and once settled, not');
});

test('REFUSED: a settled task on a harness that has `find` observes nothing either, when the record has no native id and find finds none', async () => {
  // A harness that names no native id, and forgets a session once it is done: `find` finds nothing, and a view used to observe.
  const sessions = new Map<string, Sighting>();
  const counts = { observe: 0, find: 0 };
  const runner = {
    async spawn(r: { name: string }) { sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' }); },
    async observe() { counts.observe++; return new Map(sessions); },
    async find(name: string) { counts.find++; const s = sessions.get(name); return s && s.state !== 'done' ? { sessionId: s.sessionId } : undefined; },
    async stop() {},
    async logs(sessionId: string) { return `logs of ${sessionId}`; },
  };
  const engine = createEngine({ root: scratch('ae-settled-root-'), harnesses: { mine: runner } });
  const id = await engine.file({ brief: 'b', cwd: scratch('ae-settled-cwd-') });
  await engine.tick();
  sessions.set(`ae/${id}/1`, { ...sessions.get(`ae/${id}/1`)!, state: 'done' });
  await engine.tick();

  const before = counts.observe;
  const v = await engine.view(id);
  assert.equal(v.phase, 'succeeded');
  assert.equal(v.state.attempts[0]?.nativeId, null, 'nothing named a native id');
  assert.equal(v.sessionId, 's-1', 'the handle its end was recorded under');
  assert.equal(await engine.logs(id), 'logs of s-1');
  assert.equal(counts.observe, before, 'viewed, and its logs read, with no observe');
  assert.equal(counts.find, 2, 'asked by name once a read, and found nothing');
});

test('a pass and a view of every task, as the orchestrator makes each pass: the check harness is observed once for the pass and once for each check in flight', async () => {
  const engine = createEngine({ root: scratch('ae-settled-root-'), harnesses: { check }, defaultHarness: 'check' });
  const done = await Promise.all([1, 2, 3, 4, 5].map(async () => engine.file({ brief: 'b', cwd: scratch('ae-settled-cwd-') })));
  for (const id of done) await settle(engine, id);
  const cwd = scratch('ae-settled-cwd-');
  fs.writeFileSync(path.join(cwd, 'hold'), '');
  const running = await engine.file({ brief: 'b', cwd });
  await engine.tick();
  const until = Date.now() + 20_000;
  while (!(await engine.view(running)).phase.startsWith('running')) {
    assert.ok(Date.now() < until, 'the check runs');
    await sleep(50);
  }

  const before = calls(engine);
  await engine.tick();
  for (const id of [...done, running]) await engine.view(id);
  assert.equal(calls(engine) - before, 2, 'the pass, and the one check in flight: none for the five settled');

  fs.rmSync(path.join(cwd, 'hold'));
  await settle(engine, running);
});
