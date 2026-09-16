/**
 * The engine against a harness that costs nothing.
 *
 * The tests that matter here are the crash ones: the engine is killed at each point in the
 * sequence and restarted, and the board must end up with EXACTLY ONE session per attempt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { Journal } from '../src/journal.ts';
import { Runner } from '../src/runner.ts';
import { file, GRACE_MS, LIVE, requestStop, step, settleTask, tick, view } from '../src/engine.ts';
import { decide, fold, nameFor, type Observed, type Sighting } from '../src/domain.ts';
import type { SpawnRequest } from '../src/runner.ts';

/** One board: a journal and a fake harness whose session states a test moves by hand. */
const board = () => {
  const sessions = new Map<string, Sighting>();
  /** Every spawn the engine asked for, so a test can assert what the harness was TOLD. */
  const spawned: SpawnRequest[] = [];
  const journal = Journal.test();
  // The layers are values, so "restarting the engine" is just running a new program against the
  // same two — which is exactly what a new process would see.
  const layer = Layer.mergeAll(journal, Runner.test({ sessions, spawned }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  return { sessions, spawned, run };
};

const spec = { brief: 'do the thing', cwd: '/repo' };

/**
 * A deadline far from any boundary: 50ms, tested after 150ms have passed.
 *
 * `deadlineSeconds: 0` was the obvious choice and it is a coin flip — `ranFor > 0` is decided by
 * whether a millisecond happened to elapse inside the pass. A test that sits exactly on a
 * comparison is testing the scheduler.
 */
const SHORT_DEADLINE = 0.05;
const pastIt = () => new Promise((r) => setTimeout(r, 150));

test('the happy path: filed → spawned → running → done → settled', async () => {
  const b = board();
  const id = await b.run(file(spec));

  await b.run(tick());
  assert.equal(b.sessions.size, 1, 'exactly one session was started');
  assert.equal(await b.run(phaseOf(id, b)), 'running (working)');

  // The harness finishes the work. The engine finds out by asking, not by being told.
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'done' });
  await b.run(tick());

  assert.equal(await b.run(phaseOf(id, b)), 'succeeded');
  assert.equal(b.sessions.size, 1, 'and never started a second one');
});

test('CRASH between minting the id and spawning: the restart spawns that same id, once', async () => {
  const b = board();
  const id = await b.run(file(spec));

  // One step only — journals `starting`, then the process dies before the spawn.
  const first = await b.run(step(id, new Map()));
  assert.equal(first.do, 'start');
  assert.equal(b.sessions.size, 0, 'nothing was spawned');

  // A new engine, same journal. It must spawn the name the intent implies, not invent a second.
  await b.run(tick());
  assert.equal(b.sessions.size, 1);
  assert.ok(b.sessions.has(nameFor(id, 1)), 'the session carries the name the journal implies');
});

test('CRASH while the session runs: the restart adopts it and starts nothing', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  const running = [...b.sessions.keys()];
  assert.deepEqual(running, [nameFor(id, 1)]);

  // Five restarts while the work is still going.
  for (let i = 0; i < 5; i++) await b.run(tick());

  assert.deepEqual([...b.sessions.keys()], running, 'no second session, five restarts later');
  assert.equal(await b.run(phaseOf(id, b)), 'running (working)');
});

test('a failed attempt is retried under a NEW session id, and only up to maxAttempts', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, maxAttempts: 2 }));

  await b.run(tick());
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed' });

  await b.run(tick());
  assert.equal(b.sessions.size, 2, 'a second attempt, as a second session');
  const second = [...b.sessions.keys()].find((k) => k !== first)!;
  assert.notEqual(second, first, 'a retry is a new session, not a resumed one');

  b.sessions.set(second, { ...b.sessions.get(second)!, state: 'failed' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id, b)), 'failed');
  assert.equal(b.sessions.size, 2, 'and it stopped at maxAttempts');
});

test('a blocked session is surfaced as needing a person, not as progress', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'blocked' });

  await b.run(tick());
  assert.equal(await b.run(phaseOf(id, b)), 'needs-human');
});

test('stop: one pass asks the harness, the next observes it and settles', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  await b.run(requestStop(id));

  // Pass one sends the request and stops there: what the harness did with it is not yet observed.
  await b.run(tick());
  assert.deepEqual([...b.sessions.values()].map((s) => s.state), ['stopped'], 'the harness was actually told');
  assert.equal(await b.run(phaseOf(id, b)), 'running (stopped)', 'not settled on an assumption');

  // Pass two sees it and writes it down.
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id, b)), 'stopped');
});

test('a pass over many tasks starts each exactly once', async () => {
  const b = board();
  const ids = await Promise.all([...Array(12)].map((_, i) => b.run(file({ ...spec, brief: `task ${i}` }))));
  await b.run(tick(99));
  assert.equal(b.sessions.size, 12);

  await b.run(tick(99));
  assert.equal(b.sessions.size, 12, 'a second pass starts nothing new');
  const views = await Promise.all(ids.map((id) => b.run(phaseOf(id, b))));
  assert.ok(views.every((p) => p === 'running (working)'));
});

test('THE CEILING: a pass never admits more than the limit, however much is pending', async () => {
  const b = board();
  await Promise.all([...Array(10)].map((_, i) => b.run(file({ ...spec, brief: `task ${i}` }))));

  await b.run(tick(3));
  assert.equal(b.sessions.size, 3, 'three, not ten — admission is serial, so the count is true');

  await b.run(tick(3));
  assert.equal(b.sessions.size, 3, 'and a second pass does not sneak past it');
});

test('the ceiling drains: finishing a session frees exactly one slot', async () => {
  const b = board();
  await Promise.all([...Array(5)].map((_, i) => b.run(file({ ...spec, brief: `task ${i}` }))));
  await b.run(tick(2));
  assert.equal(b.sessions.size, 2);

  // One finishes. The next pass settles it AND admits one more — never two.
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'done' });
  await b.run(tick(2));
  assert.equal(b.sessions.size, 3, 'one freed, one admitted');
});

test('a finished task still settles when the board is full', async () => {
  // The ceiling is checked after every terminal answer, so a full board can always drain.
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick(1));
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'done' });

  await b.run(tick(0)); // a ceiling of zero: nothing may START
  assert.equal(await b.run(phaseOf(id, b)), 'succeeded', 'settling is not an admission');
});

test('the ceilings are per harness — two subscriptions are two pools', async () => {
  const b = board();
  await Promise.all([...Array(3)].map((_, i) => b.run(file({ ...spec, brief: `c${i}`, harness: 'claude' }))));
  await Promise.all([...Array(3)].map((_, i) => b.run(file({ ...spec, brief: `x${i}`, harness: 'codex' }))));

  await b.run(tick(2));
  // The fake runner is one map, but the COUNTS are kept per harness, so each pool admits two.
  assert.equal(b.sessions.size, 4, 'two claude and two codex, not two in total');
});

test('the feed carries every event, in order, with a cursor that resumes', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick(9));

  const first = await b.run(Effect.flatMap(Journal, (j) => j.feed(0)));
  assert.deepEqual(first.entries.map((e) => e.event.kind), ['filed', 'starting', 'spawned']);
  assert.ok(first.entries.every((e) => e.taskId === id));

  // Nothing new since: an empty read, and the cursor does not move.
  const again = await b.run(Effect.flatMap(Journal, (j) => j.feed(first.cursor)));
  assert.deepEqual(again.entries, []);
  assert.equal(again.cursor, first.cursor);

  // The event a workflow layer actually waits for.
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'done' });
  await b.run(tick(9));
  const after = await b.run(Effect.flatMap(Journal, (j) => j.feed(first.cursor)));
  assert.deepEqual(after.entries.map((e) => e.event.kind), ['ended', 'settled']);
});

test('settleTask is a fixpoint: it stops when nothing moves', async () => {
  const b = board();
  const id = await b.run(file(spec));
  const actions = await b.run(Effect.flatMap(Runner, (r) => Effect.flatMap(r.observe, (o) => settleTask(id, o))));
  assert.deepEqual(actions.map((a) => a.do), ['start', 'spawn', 'nothing']);
});

const phaseOf = (id: string, b: ReturnType<typeof board>) =>
  Effect.flatMap(Runner, (r) => Effect.flatMap(r.observe, (o) => Effect.map(view(id, o), (v) => v.phase)));

test('ADOPTION: a session already running under our name is adopted, not duplicated', async () => {
  const b = board();
  const id = await b.run(file(spec));

  // The spawn happened; the crash ate the journal entry that would have recorded it.
  await b.run(step(id, new Map()));                       // journals `starting`
  b.sessions.set(nameFor(id, 1), { sessionId: 'orphan', state: 'working' });

  await b.run(tick());
  assert.equal(b.sessions.size, 1, 'the orphan was adopted, not duplicated');
  assert.equal(b.sessions.get(nameFor(id, 1))!.sessionId, 'orphan');
});


// ─── resume, end to end ─────────────────────────────────────────────────────

test('a LOST attempt is resumed: the harness is told to continue the same session', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, maxAttempts: 2 }));
  await b.run(tick(9));

  // The session vanishes from the harness entirely — nobody ever said how it ended.
  const first = [...b.sessions.keys()][0]!;
  const nativeId = b.sessions.get(first)!.nativeId!;
  b.sessions.delete(first);

  // Past the grace window, the engine calls it lost and starts a second attempt that continues it.
  await new Promise((r) => setTimeout(r, 10));
  const state = fold(id, await b.run(Effect.flatMap(Journal, (j) => j.read(id))));
  assert.equal(state.attempts.length, 1);

  // Fast-forward by rewriting the spawn time: a test should not wait 30 real seconds.
  await b.run(Effect.flatMap(Journal, (j) => j.append(id, {
    kind: 'ended', at: new Date().toISOString(), attempt: 1, sessionId: first,
    observed: 'failed', reason: 'lost', nativeId,
  })));

  await b.run(tick(9));
  const second = b.spawned.at(-1)!;
  assert.equal(second.resumeFrom, nativeId, 'attempt 2 continues attempt 1');
  assert.equal(second.name, nameFor(id, 2), 'under its own name, so the board still has two rows');
});

test('a HARNESS failure is not resumed by default', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, maxAttempts: 2 }));
  await b.run(tick(9));
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed' });

  await b.run(tick(9));
  assert.equal(b.spawned.at(-1)!.resumeFrom, undefined);
  assert.equal(b.spawned.length, 2, 'it did start a second attempt — just a clean one');
  void id;
});

test("resume: 'always' continues even a harness failure", async () => {
  const b = board();
  await b.run(file({ ...spec, maxAttempts: 2, resume: 'always' }));
  await b.run(tick(9));
  const first = [...b.sessions.keys()][0]!;
  const nativeId = b.sessions.get(first)!.nativeId!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed' });

  await b.run(tick(9));
  assert.equal(b.spawned.at(-1)!.resumeFrom, nativeId);
});

// ─── the deadline, end to end ───────────────────────────────────────────────

test('a task past its deadline is stopped and settles failed', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, deadlineSeconds: SHORT_DEADLINE }));
  await b.run(tick(9));
  assert.deepEqual([...b.sessions.values()].map((s) => s.state), ['working'], 'inside the deadline, it runs');
  await pastIt();

  // Pass one: the deadline is past, so the live session is stopped.
  await b.run(tick(9));
  assert.deepEqual([...b.sessions.values()].map((s) => s.state), ['stopped'], 'the harness was told');

  // Pass two: it is no longer live, so the task settles — as failed, not as a clean stop.
  await b.run(tick(9));
  const state = fold(id, await b.run(Effect.flatMap(Journal, (j) => j.read(id))));
  assert.equal(state.settled, 'failed');
});

test('a deadline ends a blocked session, which would otherwise wait on a person for ever — and the queue never waited on it', async () => {
  const b = board();
  // Ids are explicit because admission runs in sorted id order: with a ceiling of one, WHICH
  // task gets the slot has to be a fact of the test, not of the clock.
  await b.run(file({ ...spec, id: 'a-stuck', deadlineSeconds: SHORT_DEADLINE, brief: 'stuck' }));
  await b.run(file({ ...spec, id: 'b-waiting', brief: 'waiting' }));

  await b.run(tick(1));                       // ceiling of one: 'a-stuck' goes first
  assert.equal(b.sessions.size, 1);
  assert.ok(b.sessions.has(nameFor('a-stuck', 1)), 'the one with the deadline is the one running');
  b.sessions.set(nameFor('a-stuck', 1), { ...b.sessions.get(nameFor('a-stuck', 1))!, state: 'blocked' });

  await b.run(tick(1));                       // blocked holds no slot: the second task is admitted
  assert.equal(b.sessions.size, 2, 'the queue moved before any deadline');
  await pastIt();

  await b.run(tick(1));                       // deadline stops it
  assert.equal(b.sessions.get(nameFor('a-stuck', 1))!.state, 'stopped');
  await b.run(tick(1));                       // and it settles
  assert.equal(await b.run(phaseOf('a-stuck', b)), 'failed');
});

// ─── what the ceiling counts ────────────────────────────────────────────────
// A session at work is counted, and a blocked one is not: on a permission prompt it makes no API
// calls, so it costs nothing against the rate limit the ceiling exists for. Reasoning, not a
// measurement. Counted afresh on every pass, from what the harness says now.

/** A board of tasks `ids`, filed in that order; admission runs in sorted id order. */
const filed = async (ids: string[]) => {
  const b = board();
  for (const id of ids) await b.run(file({ ...spec, id, brief: id }));
  const set = (id: string, state: Observed) => b.sessions.set(nameFor(id, 1), { ...b.sessions.get(nameFor(id, 1))!, state });
  return { ...b, set };
};

test('two blocked sessions at a ceiling of two, and a third task starts', async () => {
  const b = await filed(['a', 'b', 'c']);
  await b.run(tick(2));
  assert.deepEqual([...b.sessions.keys()], [nameFor('a', 1), nameFor('b', 1)]);
  b.set('a', 'blocked');
  b.set('b', 'blocked');

  const report = await b.run(tick(2));
  assert.ok(b.sessions.has(nameFor('c', 1)), 'a session waiting on a person holds no slot');
  assert.deepEqual(report.running, { default: 1 }, 'the pass counted the one it started, and neither blocked one');
});

test('two working sessions at a ceiling of two, and a third task does not start', async () => {
  const b = await filed(['a', 'b', 'c']);
  await b.run(tick(2));
  b.set('a', 'working');
  b.set('b', 'working');

  const report = await b.run(tick(2));
  assert.equal(b.sessions.has(nameFor('c', 1)), false, 'the ceiling refuses it');
  assert.deepEqual(report.running, { default: 2 });
  assert.equal(await b.run(phaseOf('c', b)), 'pending');
});

test('a blocked session that works again counts again on the next pass — level-triggered, nothing remembered', async () => {
  const b = await filed(['a', 'b', 'c', 'd']);
  await b.run(tick(2));                       // a and b start
  b.set('a', 'blocked');
  await b.run(tick(2));                       // a holds no slot: c starts, d waits
  assert.deepEqual([...b.sessions.keys()], [nameFor('a', 1), nameFor('b', 1), nameFor('c', 1)]);

  // a moves again: three at work at a ceiling of two. Nothing is stopped, and nothing more admitted.
  b.set('a', 'working');
  assert.deepEqual((await b.run(tick(2))).running, { default: 3 });
  assert.equal(b.sessions.size, 3, 'past the ceiling, so nothing is admitted');

  // c finishes. Had a pass remembered a as blocked, the slot c frees would go to d.
  b.set('c', 'done');
  await b.run(tick(2));
  assert.equal(await b.run(phaseOf('c', b)), 'succeeded');
  assert.equal(b.sessions.has(nameFor('d', 1)), false, 'a counts again: a and b fill the ceiling');

  // a blocks again, and the next pass sees that too.
  b.set('a', 'blocked');
  await b.run(tick(2));
  assert.ok(b.sessions.has(nameFor('d', 1)), 'and its slot is free again');
});

// ─── isolation ──────────────────────────────────────────────────────────────

test('worktree is declared by the task and passed to the harness untouched', async () => {
  const b = board();
  await b.run(file({ ...spec, worktree: true }));
  await b.run(tick(9));
  assert.equal(b.spawned.at(-1)!.worktree, true);

  const c = board();
  await c.run(file({ ...spec, worktree: 'my-branch' }));
  await c.run(tick(9));
  assert.equal(c.spawned.at(-1)!.worktree, 'my-branch');
});

// ─── the closing statement ──────────────────────────────────────────────────

const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' } }, required: ['outcome'] };

/** File a task and get its first attempt as far as the harness. */
const running = async (b: ReturnType<typeof board>, s: Parameters<typeof file>[0]) => {
  const id = await b.run(file(s));
  await b.run(tick());
  const startedAt = Date.parse((await b.run(view(id, new Map()))).state.attempts[0]!.startedAt);
  return { id, name: nameFor(id, 1), startedAt };
};

test('the schema reaches the harness verbatim — the engine never learns its shape', async () => {
  const b = board();
  await running(b, { ...spec, closeoutSchema: SCHEMA });
  assert.deepEqual(b.spawned[0]?.closeoutSchema, SCHEMA);
});

test('a statement made during the attempt ends it, whatever the harness still says', async () => {
  // `working` is where a Claude Code session stays after calling StructuredOutput — measured.
  const b = board();
  const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, busy: false, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });
  await b.run(tick());

  const v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, 'succeeded');
  assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' }, 'and what it said is on the record');
});

test('a statement made BEFORE the attempt began was inherited, not said', async () => {
  // Measured: a resumed Claude Code session's transcript holds its parent's whole conversation
  // under the child's own session id — 460 entries — so a parent's StructuredOutput call arrives
  // looking exactly like the child's. Only when it was made tells them apart.
  const b = board();
  const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, busy: false, closeout: { payload: { outcome: 'done', by: 'parent' }, at: 0 } });
  await b.run(tick());
  assert.equal((await b.run(view(id, new Map()))).state.settled, null, 'the parent finishing is not the child finishing');

  // When the harness does end it, the inherited statement is not written down as this attempt's.
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'done' });
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, 'succeeded');
  assert.equal(v.state.attempts[0]?.closeout, undefined);
});

test('a statement from a session that is still busy is not final', async () => {
  // Measured once, with the file this replaced: a step declared itself done, kept going, found it
  // could not commit, and rewrote its verdict to blocked eleven seconds later.
  const b = board();
  const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, busy: true, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });
  await b.run(tick());
  assert.equal((await b.run(view(id, new Map()))).state.settled, null, 'still typing');

  b.sessions.set(name, { ...b.sessions.get(name)!, busy: false });
  await b.run(tick());
  assert.equal((await b.run(view(id, new Map()))).state.settled, 'succeeded');
});

test('a statement ends the attempt when the harness has marked the session blocked, as when working', async () => {
  // Measured: a `claude --bg` step called StructuredOutput and ended its turn, and the next
  // observation found it `blocked`, idle. Taken as an answer the harness had already given, the
  // statement was ignored, `decide` said "needs a person" for ever, and the slot was never freed.
  const b = board();
  const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'blocked', busy: false, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });

  const action = await b.run(step(id, new Map(b.sessions)));
  assert.ok(action.do === 'record-end', `the attempt ends, not "${action.do === 'nothing' ? action.why : action.do}"`);
  assert.equal(action.observed, 'done');
  assert.deepEqual(action.closeout, { outcome: 'done' }, 'with what it said on the end');

  await b.run(tick());
  const v = await b.run(view(id, new Map(b.sessions)));
  assert.equal(v.state.settled, 'succeeded');
  assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' });
});

test('blocked with no statement still needs a person', async () => {
  const b = board();
  const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'blocked', busy: false });

  assert.deepEqual(await b.run(step(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id, b)), 'needs-human');
});

test('blocked with an inherited statement still needs a person, and the statement is not recorded', async () => {
  const b = board();
  const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'blocked', busy: false, closeout: { payload: { outcome: 'done', by: 'parent' }, at: 0 } });

  assert.deepEqual(await b.run(step(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id, b)), 'needs-human');

  // When the harness does end it, the parent's statement is not written down as this attempt's.
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'done' });
  const action = await b.run(step(id, new Map(b.sessions)));
  assert.ok(action.do === 'record-end');
  assert.equal(action.closeout, undefined);
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, 'succeeded');
  assert.equal(v.state.attempts[0]?.closeout, undefined);
});

test('blocked and busy: a statement it may yet revise still waits', async () => {
  const b = board();
  const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'blocked', busy: true, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });

  assert.deepEqual(await b.run(step(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
  assert.equal((await b.run(view(id, new Map()))).state.settled, null);
});

test('a session the harness already ended keeps its statement on the record — unread', async () => {
  const b = board();
  const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'done', closeout: { payload: { outcome: 'blocked' }, at: startedAt + 1000 } });
  await b.run(tick());

  const v = await b.run(view(id, new Map()));
  // `blocked` means something to whoever filed the task. To the engine it is a payload.
  assert.equal(v.state.settled, 'succeeded');
  assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'blocked' });
});

test('no schema, no statement: a task ends exactly as it did before', async () => {
  const b = board();
  const { id, name } = await running(b, spec);
  b.sessions.set(name, { ...b.sessions.get(name)!, busy: false });
  await b.run(tick());
  assert.equal((await b.run(view(id, new Map()))).state.settled, null);

  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'done' });
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, 'succeeded');
  assert.equal(v.state.attempts[0]?.closeout, undefined);
});

// ─── the fence and the effort: carried, never read ──────────────────────────

import fs from 'node:fs';

test('tools, disallowedTools, effort and mcp are declared by the task and reach every attempt untouched', async () => {
  const b = board();
  const mcp = { browser: { command: 'npx', args: ['@playwright/mcp'] } };
  await b.run(file({ ...spec, maxAttempts: 2, tools: ['Read', 'Grep'], disallowedTools: ['Bash(npm run build)'], effort: 'low', mcp, budgetUsd: 0.5 }));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'failed' });
  await b.run(tick());
  assert.equal(b.spawned.length, 2, 'a retry was spawned');
  for (const r of b.spawned) {
    assert.deepEqual(r.tools, ['Read', 'Grep'], 'the retry is fenced exactly as the first attempt was');
    assert.deepEqual(r.disallowedTools, ['Bash(npm run build)'], 'and denied the same');
    assert.equal(r.effort, 'low');
    assert.deepEqual(r.mcp, mcp, 'and given the same servers');
    assert.equal(r.budgetUsd, 0.5, 'and the same cap');
  }

  const plain = board();
  await plain.run(file(spec));
  await plain.run(tick());
  assert.equal(plain.spawned[0]!.tools, undefined, 'no list, no fence');
  assert.equal(plain.spawned[0]!.disallowedTools, undefined, 'no deny list');
  assert.equal(plain.spawned[0]!.effort, undefined);
  assert.equal(plain.spawned[0]!.mcp, undefined, 'no map, no servers of its own');
  assert.equal(plain.spawned[0]!.budgetUsd, undefined, 'no budget, no cap');
});

test('decide never reads tools, effort, MCP servers, a budget, usage, a cost, an exit code, an end time or what a person said — carried on the record, never judged', () => {
  const source = fs.readFileSync(new URL('../src/domain.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function decide('), source.indexOf('function resumeTarget('));
  assert.ok(body.includes('return'), 'found the body of decide');
  assert.doesNotMatch(body, /\.tools|\.disallowedTools|\.effort|\.mcp\b|\.usage|\.exitCode|\.endedAt|\.said|\.budgetUsd|\.costUsd/);
});

test('a session its harness ended at its budget ends failed, reason budget, with what it cost — and the task settles failed naming it, with an attempt left, even under resume: always', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, maxAttempts: 2, resume: 'always', budgetUsd: 0.01 }));
  await b.run(tick());
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed', exitCode: 1, budgetSpent: true, usage: { costUsd: 0.018, apiMs: 718 } });
  for (let i = 0; i < 3; i++) await b.run(tick());

  const { state } = await b.run(view(id, new Map()));
  const [a] = state.attempts;
  assert.deepEqual([a!.ended, a!.reason, a!.exitCode], ['failed', 'budget', 1]);
  assert.deepEqual(a!.usage, { costUsd: 0.018, apiMs: 718 }, 'and what it spent getting there');
  assert.equal(state.settled, 'failed');
  assert.equal(state.attempts.length, 1, 'a budget spent is spent: no attempt 2');
  assert.equal(b.spawned.length, 1, 'and nothing spawned for one');
  const settled = (await b.run(Effect.flatMap(Journal, (j) => j.read(id)))).find((e) => e.kind === 'settled');
  assert.match(settled?.kind === 'settled' ? settled.note ?? '' : '', /^attempt 1 spent its budget\. File the task again with a larger one/);
});

// ─── usage: carried from the sighting, null when nobody measured ────────────

test('what a session consumed and how it exited go on the attempt, from the sighting that ended it', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  const usage = { turns: 3, toolCalls: 5, inputTokens: 1200, outputTokens: 80 };
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'done', usage, exitCode: 0 });
  await b.run(tick());
  const [a] = (await b.run(view(id, new Map()))).state.attempts;
  assert.deepEqual(a!.usage, usage);
  assert.equal(a!.exitCode, 0);
});

test('what a release reads once it has stopped a session is written on the attempt once, as measured — a session left listed is asked on every pass', async () => {
  const sessions = new Map<string, Sighting>();
  const ops = testOps({ sessions });
  let asked = 0;
  const layer = Layer.mergeAll(Journal.test(), Runner.layer({
    ...ops,
    // Stopped by the first call, as Claude Code writes a session's cost only then; listed still, as a worktree task's is.
    release: () => Effect.sync(() => (++asked === 1 ? { turns: 2, costUsd: 0.5, apiMs: 900 } : undefined)),
  }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file(spec));
  await run(tick());
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'done', usage: { turns: 2 } });
  for (let i = 0; i < 3; i++) await run(tick());

  assert.equal(asked, 3, 'released on every pass that still sees it');
  const events = await run(Effect.flatMap(Journal, (j) => j.read(id)));
  const ended = events.find((e) => e.kind === 'ended');
  assert.deepEqual(ended?.kind === 'ended' && ended.usage, { turns: 2 }, 'its end, as the sighting that ended it said');
  assert.deepEqual(events.filter((e) => e.kind === 'measured').map((e) => e.kind === 'measured' && e.usage), [{ turns: 2, costUsd: 0.5, apiMs: 900 }], 'written once');
  assert.deepEqual(fold(id, events).attempts[0]!.usage, { turns: 2, costUsd: 0.5, apiMs: 900 });
});

test('an attempt nobody measured records null — not zeros that would read as free', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'done' }); // the fake harness measures nothing
  await b.run(tick());
  const [a] = (await b.run(view(id, new Map()))).state.attempts;
  assert.equal(a!.usage, null);
  assert.equal(a!.exitCode, null);
});

// ─── when an attempt ended: the time the engine wrote it down ───────────────

test('the settled view carries when its attempt ended, as journalled — and null while it ran', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  assert.equal((await b.run(view(id, new Map()))).state.attempts[0]!.endedAt, null, 'in flight, it has not ended');

  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'done' });
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  const ended = (await b.run(Effect.flatMap(Journal, (j) => j.read(id)))).find((e) => e.kind === 'ended');
  assert.equal(v.state.settled, 'succeeded');
  assert.ok(ended, 'the end was journalled');
  assert.equal(v.state.attempts[0]!.endedAt, ended.at);
  assert.ok(Date.parse(v.state.attempts[0]!.startedAt) <= Date.parse(ended.at), 'and it ended after it started');
});

// ─── what counts as live ────────────────────────────────────────────────────

test('LIVE is exactly the states decide waits on — `busy` is not a state, so it is not one of them', () => {
  // Exhaustive by type: a state added to `Observed` and not here does not compile.
  const STATES: Record<Observed, true> = { working: true, blocked: true, done: true, failed: true, stopped: true };
  const t0 = new Date(0).toISOString();
  const inFlight = fold('t', [
    { kind: 'filed', at: t0, brief: 'b', cwd: '/r', maxAttempts: 1 },
    { kind: 'starting', at: t0, attempt: 1 },
    { kind: 'spawned', at: t0, attempt: 1 },
  ]);
  const waitsOn = (Object.keys(STATES) as Observed[]).filter((state) =>
    decide(inFlight, new Map([[nameFor('t', 1), { sessionId: 's', state }]]), { at: new Date(0), graceMs: GRACE_MS, used: 0, max: 1 }).do === 'nothing');
  assert.deepEqual([...LIVE].sort(), waitsOn.sort());
  assert.equal((LIVE as ReadonlySet<string>).has('busy'), false);
});

// ─── a harness that refuses to start ────────────────────────────────────────

import { RunnerError, testOps } from '../src/runner.ts';

/**
 * A board whose harness fails some spawns, two ways.
 *
 *   brief `refuse`           it says nothing started: `refused`, in the words a CLI would use
 *   brief `start-then-fail`  it registers the session, then fails without saying so — a launcher
 *                            that lost its acknowledgement, the case a spawn error cannot rule out
 */
const refusingBoard = () => {
  const sessions = new Map<string, Sighting>();
  const ops = testOps({ sessions });
  const layer = Layer.mergeAll(Journal.test(), Runner.layer({
    ...ops,
    spawn: (r) => r.brief === 'refuse'
      ? Effect.fail(new RunnerError({ verb: 'spawn', message: "claude --bg: error: option '--permission-mode <mode>' argument 'yolo' is invalid.", refused: true }))
      : r.brief === 'start-then-fail'
        ? ops.spawn(r).pipe(Effect.andThen(Effect.fail(new RunnerError({ verb: 'spawn', message: 'launcher: lost the acknowledgement' }))))
        : ops.spawn(r),
  }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  return { sessions, run };
};

test('a spawn the harness refuses ends the attempt, unstartable, in its words — and the tick goes on', async () => {
  const b = refusingBoard();
  const bad = await b.run(file({ ...spec, brief: 'refuse', id: 'a-bad' }));
  const good = await b.run(file({ ...spec, id: 'b-good' }));

  // Before, this pass rejected: every task behind the bad one stalled, on every pass.
  await b.run(tick());

  const v = await b.run(view(bad, new Map()));
  assert.equal(v.state.settled, 'failed');
  assert.equal(v.state.attempts[0]?.reason, 'unstartable');
  assert.match(v.state.attempts[0]?.error ?? '', /argument 'yolo' is invalid/);
  assert.ok(b.sessions.has(nameFor(good, 1)), 'the task behind it started in the same pass');
});

test('an unstartable attempt spends an attempt like any other failure, and settles when they run out', async () => {
  const b = refusingBoard();
  const id = await b.run(file({ ...spec, brief: 'refuse', maxAttempts: 2 }));
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.deepEqual(v.state.attempts.map((a) => a.reason), ['unstartable', 'unstartable']);
  assert.equal(v.state.settled, 'failed');
});

test('a spawn error that does not say nothing started is recorded as spawned, and its session adopted', async () => {
  // The reviewer's case: the session exists, the spawn call failed anyway. Ending the attempt here
  // left a working session nothing would adopt, stop or bound, and a retry beside it.
  const b = refusingBoard();
  const id = await b.run(file({ ...spec, brief: 'start-then-fail', maxAttempts: 2 }));

  await b.run(tick());
  let v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, null, 'not failed: a session may exist under the name');
  assert.equal(v.state.attempts.length, 1, 'and no second attempt beside it');
  assert.ok(v.state.attempts[0]!.spawnedAt, 'recorded as spawned, so the grace window applies');
  assert.match(v.state.attempts[0]!.error ?? '', /lost the acknowledgement/);

  await b.run(tick());
  assert.equal((await b.run(view(id, await b.run(Effect.flatMap(Runner, (r) => r.observe))))).phase, 'running (working)', 'adopted');

  // Stop reaches it, as it reaches any session the engine knows.
  await b.run(requestStop(id));
  await b.run(tick());
  await b.run(tick());
  v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, 'stopped');
  assert.equal(b.sessions.size, 1, 'one session, ever');
});

test('...and when no session shows up, the grace window ends it lost, as for any spawn never registered', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(step(id, new Map()));                                           // start
  await b.run(Effect.flatMap(Journal, (j) => j.append(id, {                   // a spawn that returned an error
    kind: 'spawned', at: new Date().toISOString(), attempt: 1, error: 'launcher: lost the acknowledgement',
  })));
  const state = fold(id, await b.run(Effect.flatMap(Journal, (j) => j.read(id))));
  const later = { at: new Date(Date.now() + GRACE_MS + 1_000), graceMs: GRACE_MS, used: 0, max: 1 };
  assert.deepEqual(decide(state, new Map(), later), { do: 'record-end', attempt: 1, sessionId: '(never seen)', observed: 'failed', reason: 'lost' });
});
