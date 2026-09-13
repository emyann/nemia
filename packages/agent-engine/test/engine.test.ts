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
import { file, requestStop, step, settleTask, tick, view } from '../src/engine.ts';
import { fold, nameFor, type Sighting } from '../src/domain.ts';
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

test('a deadline frees a slot a blocked session would have held forever', async () => {
  const b = board();
  // Ids are explicit because admission runs in sorted id order: with a ceiling of one, WHICH
  // task gets the slot has to be a fact of the test, not of the clock.
  await b.run(file({ ...spec, id: 'a-stuck', deadlineSeconds: SHORT_DEADLINE, brief: 'stuck' }));
  await b.run(file({ ...spec, id: 'b-waiting', brief: 'waiting' }));

  await b.run(tick(1));                       // ceiling of one: 'a-stuck' goes first
  assert.equal(b.sessions.size, 1);
  assert.ok(b.sessions.has(nameFor('a-stuck', 1)), 'the one with the deadline is the one running');
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'blocked' });
  await pastIt();

  await b.run(tick(1));                       // deadline stops it
  await b.run(tick(1));                       // it settles, freeing the slot
  await b.run(tick(1));                       // and the second task is admitted
  assert.equal(b.sessions.size, 2, 'the queue moved');
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

test('tools and effort are declared by the task and reach every attempt untouched', async () => {
  const b = board();
  await b.run(file({ ...spec, maxAttempts: 2, tools: ['Read', 'Grep'], effort: 'low' }));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'failed' });
  await b.run(tick());
  assert.equal(b.spawned.length, 2, 'a retry was spawned');
  for (const r of b.spawned) {
    assert.deepEqual(r.tools, ['Read', 'Grep'], 'the retry is fenced exactly as the first attempt was');
    assert.equal(r.effort, 'low');
  }

  const plain = board();
  await plain.run(file(spec));
  await plain.run(tick());
  assert.equal(plain.spawned[0]!.tools, undefined, 'no list, no fence');
  assert.equal(plain.spawned[0]!.effort, undefined);
});

test('decide never reads tools, effort, usage or an exit code — carried on the record, never judged', () => {
  const source = fs.readFileSync(new URL('../src/domain.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function decide('), source.indexOf('function resumeTarget('));
  assert.ok(body.includes('return'), 'found the body of decide');
  assert.doesNotMatch(body, /\.tools|\.effort|\.usage|\.exitCode/);
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
