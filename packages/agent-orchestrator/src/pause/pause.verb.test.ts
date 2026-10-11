/**
 * The store's pause at once on disk: `pauseNow` puts the pause, writes for each task at work but a landing the ask that names it, and
 * asks the engine to stop it only once that ask is on disk; it keeps a pause that stands as it was; a stop the engine refuses leaves the
 * ask; `nowRead` writes nothing. A store of its own, since `WF_ROOT` is read as the module loads; an engine of its own, which records.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import type { Workflow } from '../step/step.ts';
import type { FinishingView } from './pause.ts';
import { promised } from '../../test/promised.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-pause-now-');
process.env.WF_ROOT = ROOT;
const { nowRead, pauseNow } = await import('./pause.verb.ts');
const { askFile, asksDir } = await import('../record/record.store.ts');
const { pauseFile, putPause, readPause, resumePause } = await import('./pause.store.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

const WORKFLOW: Workflow[] = [
  { name: 'implement', after: [], body: 'Implement it.', check: 'npm test' },
  { name: 'ship', after: ['implement'], body: 'Ship it.', workspace: 'main', check: 'npm test' },
];

/** A run on disk whose steps are `steps`, its workflow frozen on its record. */
function writeRun(id: string, steps: Record<string, object>, more: object = {}): void {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      workspace: ROOT,
      brief: `The brief of ${id}`,
      createdAt: '2026-10-04T12:00:00.000Z',
      workflowDir: path.join(ROOT, 'no-such-workflow'),
      place: { kind: 'folder' },
      workflow: WORKFLOW,
      steps,
      ...more,
    }),
  );
}

const ATTEMPT = { startedAt: '2026-10-04T12:00:00.000Z', spawnedAt: null, endedAt: null, reason: null, usage: null, ended: null };
const atWork = (id: string): FinishingView & { id: string } => ({
  id,
  phase: 'running (working)',
  state: { brief: 'b', settled: null, attempts: [ATTEMPT] },
});

/**
 * An engine whose tasks `working` are at work, each viewed so, as the pause's read views a run with a check due; recording each stop it
 * is asked and whether its ask was on disk then.
 */
function engineOf(working: string[], refuse: string[] = []) {
  const stops: { taskId: string; askOnDisk: boolean }[] = [];
  const asked = (taskId: string) =>
    fs.existsSync(asksDir('r-a')) &&
    fs.readdirSync(asksDir('r-a')).some((f) => fs.readFileSync(path.join(asksDir('r-a'), f), 'utf8').includes(taskId));
  const e = promised({
    list: async (ids: string[]) => ({ views: ids.filter((id) => working.includes(id)).map(atWork) }),
    view: async (id: string) => atWork(id),
    stop: async (taskId: string) => {
      stops.push({ taskId, askOnDisk: asked(taskId) });
      if (refuse.includes(taskId)) throw Object.assign(new Error(`task ${taskId} is settled`), { exitCode: 2 });
    },
  });
  return { e, stops };
}

const askOf = (id: string, step: string, n: number) => JSON.parse(fs.readFileSync(askFile(id, step, n), 'utf8'));

test('a pause at once writes the pause, then for each task at work the ask naming it, and stops each only once its ask is on disk', async () => {
  writeRun('r-a', { implement: { taskId: 't1', check: { taskId: 'c1' } } });
  writeRun('r-b', { implement: { taskId: 't2', check: { taskId: 'c2' } }, ship: { taskId: 't3' } });
  writeRun('r-x', { implement: { taskId: 't4' } }, { cancelledAt: '2026-10-04T12:01:00.000Z' });
  const { e, stops } = engineOf(['c1', 't3', 't4']);
  const now = new Date('2026-10-04T13:00:00.000Z');
  const paused = await runWith(e, pauseNow({ why: 'the bill', by: 'ann' }, now));
  assert.deepEqual(paused.pause, { at: '2026-10-04T13:00:00.000Z', by: 'ann', why: 'the bill' });
  assert.equal(paused.kept, false);
  assert.deepEqual(paused.interrupted, [{ run: 'r-a', step: 'implement', kind: 'check', taskId: 'c1' }]);
  assert.deepEqual(stops, [{ taskId: 'c1', askOnDisk: true }]);
  assert.deepEqual(askOf('r-a', 'implement', 2), {
    step: 'implement',
    try: 2,
    mode: 'recheck',
    interrupted: 'c1',
    at: '2026-10-04T13:00:00.000Z',
  });
  assert.equal(fs.existsSync(asksDir('r-b')), false, 'a landing is left to finish');
  assert.equal(fs.existsSync(asksDir('r-x')), false, 'a run called off is left alone');
  fs.rmSync(asksDir('r-a'), { recursive: true });
  resumePause();
});

test('a pause at once keeps a pause that stands as it was put, and nudges the session it stops', async () => {
  writeRun('r-a', { implement: { taskId: 't1' } });
  putPause({ why: 'merging by hand', by: 'bob' }, new Date('2026-10-04T12:30:00.000Z'));
  const before = fs.readFileSync(pauseFile());
  const { e, stops } = engineOf(['t1']);
  const paused = await runWith(e, pauseNow({ why: 'the bill', by: 'ann' }, new Date('2026-10-04T13:00:00.000Z')));
  assert.equal(paused.kept, true);
  assert.deepEqual(paused.pause, { at: '2026-10-04T12:30:00.000Z', by: 'bob', why: 'merging by hand' });
  assert.deepEqual(fs.readFileSync(pauseFile()), before);
  assert.deepEqual(stops, [{ taskId: 't1', askOnDisk: true }]);
  assert.equal(askOf('r-a', 'implement', 2).mode, 'nudge');
  assert.equal(askOf('r-a', 'implement', 2).interrupted, 't1');
  fs.rmSync(asksDir('r-a'), { recursive: true });
  resumePause();
});

test('a stop the engine refuses leaves its ask for the tick to set aside, and a step already asked of is left at work', async () => {
  writeRun('r-a', { implement: { taskId: 't1' } });
  writeRun('r-b', { implement: { taskId: 't2' } });
  fs.mkdirSync(asksDir('r-b'), { recursive: true });
  fs.writeFileSync(
    askFile('r-b', 'implement', 2),
    JSON.stringify({ step: 'implement', try: 2, mode: 'fresh', at: '2026-10-04T12:00:00Z' }),
  );
  const { e, stops } = engineOf(['t1', 't2'], ['t1']);
  const paused = await runWith(e, pauseNow({}, new Date('2026-10-04T13:00:00.000Z')));
  assert.deepEqual(paused.interrupted, [{ run: 'r-a', step: 'implement', kind: 'session', taskId: 't1' }]);
  assert.deepEqual(paused.skipped, [{ run: 'r-b', step: 'implement', kind: 'session', taskId: 't2' }]);
  assert.deepEqual(stops, [{ taskId: 't1', askOnDisk: true }]);
  assert.equal(askOf('r-a', 'implement', 2).interrupted, 't1');
  assert.equal(askOf('r-b', 'implement', 2).mode, 'fresh');
  fs.rmSync(asksDir('r-a'), { recursive: true });
  fs.rmSync(asksDir('r-b'), { recursive: true });
  fs.rmSync(path.join(ROOT, 'runs', 'r-b.json'));
  resumePause();
});

test('the pause read after a pause at once says each task it stopped resumed, and one stopped by another hand not', async () => {
  const { pausedRead } = await import('../list/list.verb.ts');
  writeRun('r-a', { implement: { taskId: 't1' } });
  writeRun('r-b', { implement: { taskId: 't2' } });
  const { e } = engineOf(['t1']);
  await runWith(e, pauseNow({}, new Date('2026-10-04T13:00:00.000Z')));
  const stopped = (id: string): FinishingView & { id: string } => ({ ...atWork(id), state: { ...atWork(id).state, stopRequested: true } });
  const read = promised({
    list: async (ids: string[]) => ({ views: ids.filter((id) => ['t1', 't2'].includes(id)).map(stopped) }),
    view: async (id: string) => stopped(id),
  });
  assert.deepEqual((await runWith(read, pausedRead())).finishing, [
    { run: 'r-a', step: 'implement', kind: 'session', stopping: true, resumed: true },
    { run: 'r-b', step: 'implement', kind: 'session', stopping: true },
  ]);
  fs.rmSync(asksDir('r-a'), { recursive: true });
  fs.rmSync(path.join(ROOT, 'runs', 'r-b.json'));
  resumePause();
});

test('what a pause at once would stop is read, and nothing is written nor stopped', async () => {
  writeRun('r-a', { implement: { taskId: 't1', check: { taskId: 'c1' } } });
  const { e, stops } = engineOf(['c1']);
  assert.deepEqual(await runWith(e, nowRead()), [{ run: 'r-a', step: 'implement', kind: 'check', taskId: 'c1' }]);
  assert.deepEqual(stops, []);
  assert.equal(readPause(), null);
  assert.equal(fs.existsSync(asksDir('r-a')), false);
});

test('nemia pause --now says what it would stop and writes nothing; --yes acts; a plain pause on a standing one names --now', async () => {
  const { PAUSE } = await import('../command/runs.verb.ts');
  writeRun('r-a', { implement: { taskId: 't1' } });
  const { e, stops } = engineOf(['t1']);
  const preview = await runWith(e, PAUSE.handler({ now: true }));
  assert.deepEqual(PAUSE.print(preview, { now: true }), [
    'nemia pause --now would pause the store and stop 1 at work, each tried again on nemia resume:',
    "   r-a's implement: its session",
    'An interrupted step redoes its unfinished work and reads its context again. A landing that checks or merges is left to finish.',
    'nemia pause --now --yes does it.',
  ]);
  assert.equal(fs.existsSync(pauseFile()), false);
  assert.equal(fs.existsSync(asksDir('r-a')), false);
  assert.deepEqual(stops, []);
  await runWith(e, PAUSE.handler({ yes: true, why: 'lunch', by: 'ann' }));
  assert.deepEqual(stops, [], '--yes alone pauses as a plain pause does');
  assert.equal(readPause()?.why, 'lunch');
  await assert.rejects(runWith(e, PAUSE.handler({ why: 'other' })), (err: Error) => {
    assert.match(err.message, /nemia pause --now stops what still finishes under it/);
    return true;
  });
  const acted = await runWith(e, PAUSE.handler({ now: true, yes: true, why: 'other' }));
  assert.equal(
    PAUSE.print(acted, {})[0],
    "the store's pause stands as it was put, since " + readPause()?.at + ' by ann: lunch; now what runs is asked to stop',
  );
  assert.deepEqual(stops, [{ taskId: 't1', askOnDisk: true }]);
  fs.rmSync(asksDir('r-a'), { recursive: true });
  resumePause();
});
