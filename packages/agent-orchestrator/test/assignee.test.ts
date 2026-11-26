/**
 * `nemia assign`: a run in someone's hand, told on the stage (`story.ts`) — the test place and the engine's stand-in. The story: a run at
 * its gate assigned, listed in flight with its ask still asked, refused a second assignee, given back and waiting on you again, then
 * assigned and approved, which nothing refuses. Beside it, what the verb refuses of the run itself, a hold and an assignee standing
 * together, and the tick's end of an assignee whose time ran out or whose run is over, on its first pass — level-triggered.
 *
 * The rules themselves — what refuses an assignee, when one lapses, and who a run waits on — are proved by their contracts
 * (`contracts/assignee.contract.ts`, `contracts/waits-on-you.contract.ts`); this file holds the files, the verb and the pass. The test's
 * store is its own, at `ROOT`, given as `ENV`.
 */
import { runRecord } from '../testing.ts';
import { beforeAll, describe, test, vi } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged, story, type Board } from './story.ts';
import { advanceRun, approveRun, cancelRun, hold, runWith, startRun, tickRun } from '../src/runner.ts';
import { howOf } from '../src/summary/how.verb.ts';
import { runsSummarized } from '../src/summary/summary.verb.ts';
import { EngineService, engineOf } from '../src/runtime-client.ts';
import { kindOf } from '../src/run-state/run-state.ts';
import type { Env } from '../src/config/config.store.ts';
import { told } from './typed.ts';

const ROOT = scratch('wf-assignee-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const stage = staged({ runWith, main: told, engineOf, env: ENV });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const world = () => stage.place().world;
const fileOf = (id: string, suffix: 'assignee' | 'unassigned' | 'hold') => path.join(ROOT, 'runs', `${id}.${suffix}`);
const readFile = (id: string, suffix: 'assignee' | 'unassigned' | 'hold') =>
  JSON.parse(fs.readFileSync(fileOf(id, suffix), 'utf8')) as Record<string, unknown>;

/** What `nemia assign` answers: the run, whether it was given back, and the assignee. */
type Assigned = { id: string; ended: boolean; assignee: { at: string; forMs: number; name?: string; why?: string } };
const assignTyped = async (...argv: string[]) => (await stage.main(['assign', ...argv])) as Assigned;

/** A repository with one commit. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, { 'README.md': 'readme\n' });
  return repo;
};
/** Two steps, `implement` at its gate and `review` after it. */
const gated = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'gated-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ngate: true\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};
/** One pass of the tick's advance over run `id`. */
const tick = (b: Board, id: string) => stage.runWith(b.e, advanceRun(runRecord(ROOT, id)));
/** A run at its gate on `b`: `implement` signed, `review` held back by the gate. */
const atItsGate = async (b: Board, repo: string, brief: string) => {
  const run = await stage.runPlaced(startRun({ brief, repo, workflowDir: gated() }));
  await tick(b, run.id);
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await tick(b, run.id);
  return run;
};
/** Run `id`'s summary as the whole list judges it, read now. */
const summaryOf = async (b: Board, id: string) => {
  const all = await stage.runWith(
    b.e,
    Effect.gen(function* () {
      return yield* runsSummarized(yield* EngineService, yield* howOf());
    }),
  );
  const one = all.find((run) => run.id === id);
  assert.ok(one, `${id} is listed`);
  return one;
};
/** `b`'s engine for a whole pass: its own tick quiet, and no tally of the pass, which the stand-in keeps neither of. */
const quiet = (b: Board) => Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };
/** Refused by kind and exit 2. */
const refusedAs = (tag: string) => (err: Error & { exitCode?: number; _tag?: string }) => {
  assert.equal(err._tag, tag, err.message);
  assert.equal(err.exitCode, 2, err.message);
  return true;
};

describe('a run at its gate assigned: in flight while it stands, given back to wait on you, and never refused an answer', () => {
  let b!: Board;
  let id = '';
  const user = os.userInfo().username;
  beforeAll(async () => {
    const t = teardowns();
    b = stage.board();
    id = (await atItsGate(b, aRepo(), 'assigned at its gate')).id;
    return t.end;
  });
  const s = story(test);
  s.test('before it is assigned, the run at its gate waits on you', async () => {
    assert.equal(kindOf(await summaryOf(b, id)), 'waiting');
  });
  s.test('`nemia assign <run>` puts it in the OS user’s hand for an hour, written beside the run', async () => {
    const put = await assignTyped(id);
    assert.deepEqual([put.id, put.ended, put.assignee.name, put.assignee.forMs], [id, false, user, 3_600_000]);
    assert.deepEqual(Object.keys(readFile(id, 'assignee')), ['at', 'forMs', 'name']);
  });
  s.test('it waits on nobody else: listed in flight, its assignee served with when it comes back, its ask still asked', async () => {
    const summary = await summaryOf(b, id);
    assert.equal(kindOf(summary), 'inFlight');
    assert.ok(summary.waitingOnYou.length > 0, 'what it asks is still asked');
    assert.equal(summary.assignee?.name, user);
    assert.ok(summary.assignee?.comesBackAt, 'an ask is timed');
  });
  s.test('a second assignee is refused while one stands, and the first stands as it was', async () => {
    const before = fs.readFileSync(fileOf(id, 'assignee'), 'utf8');
    await assert.rejects(assignTyped(id, '--to', 'ann'), refusedAs('Conflict'));
    assert.equal(fs.readFileSync(fileOf(id, 'assignee'), 'utf8'), before);
  });
  s.test('`--off` gives it back: the file gone, its receipt says given back, and the run waits on you again', async () => {
    const back = await assignTyped(id, '--off');
    assert.equal(back.ended, true);
    assert.equal(fs.existsSync(fileOf(id, 'assignee')), false);
    assert.equal(readFile(id, 'unassigned').how, 'given-back');
    assert.equal(kindOf(await summaryOf(b, id)), 'waiting');
  });
  s.test('`--off` of a run nobody has in hand is refused', async () => {
    await assert.rejects(assignTyped(id, '--off'), refusedAs('Conflict'));
  });
  s.test('assigned again with words and a time, an approval at its gate is taken all the same', async () => {
    const put = await assignTyped(id, '--to', 'operator', '--why', 'reading the plan', '--for', '2h');
    assert.deepEqual([put.assignee.name, put.assignee.why, put.assignee.forMs], ['operator', 'reading the plan', 7_200_000]);
    await stage.runWith(b.e, approveRun(id, 'implement'));
    await tick(b, id);
    const summary = await summaryOf(b, id);
    assert.equal(summary.assignee?.name, 'operator', 'the assignee stands while the run works');
    assert.equal(summary.assignee?.comesBackAt, null, 'and is not timed while nothing is asked');
  });
});

test('a cancelled run is refused an assignee, and nothing is written', async () => {
  const b = stage.board();
  const run = await atItsGate(b, aRepo(), 'cancelled at its gate');
  await stage.runWith(b.e, cancelRun(run.id));
  await assert.rejects(assignTyped(run.id), refusedAs('Conflict'));
  assert.equal(fs.existsSync(fileOf(run.id, 'assignee')), false);
});

test('a held run may be assigned: both files stand, and neither is the other', async () => {
  const b = stage.board();
  const repo = aRepo();
  const run = await atItsGate(b, repo, 'held and assigned');
  await stage.runWith(b.e, hold(run.id, []));
  await assignTyped(run.id);
  assert.ok(fs.existsSync(fileOf(run.id, 'hold')) && fs.existsSync(fileOf(run.id, 'assignee')));
  const record = runRecord(ROOT, run.id);
  assert.ok(record.hold && record.assignee, 'the record carries both');
});

test('the tick ends an assignee whose ask waited past its time, on its first pass, and its receipt says it lapsed', async () => {
  const b = stage.board();
  const run = await atItsGate(b, aRepo(), 'left at its gate');
  await assignTyped(run.id, '--for', '1s');
  vi.useFakeTimers({ toFake: ['Date'], now: Date.parse(String(readFile(run.id, 'assignee').at)) + 7_200_000 });
  try {
    assert.equal((await summaryOf(b, run.id)).assignee, null, 'a read serves none once its time ran out, before any pass');
    await stage.runWith(quiet(b), tickRun());
  } finally {
    vi.useRealTimers();
  }
  assert.equal(fs.existsSync(fileOf(run.id, 'assignee')), false);
  assert.equal(readFile(run.id, 'unassigned').how, 'lapsed');
});

test('the tick ends an assignee whose run is over, and its receipt says it ended with it', async () => {
  const b = stage.board();
  const run = await atItsGate(b, aRepo(), 'assigned then called off');
  await assignTyped(run.id);
  await stage.runWith(b.e, cancelRun(run.id));
  await stage.runWith(quiet(b), tickRun());
  assert.equal(fs.existsSync(fileOf(run.id, 'assignee')), false);
  assert.equal(readFile(run.id, 'unassigned').how, 'ended');
});
