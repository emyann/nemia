/**
 * The engine against a harness that costs nothing.
 *
 * The tests that matter here are the crash ones: the engine is killed at each point in the
 * sequence and restarted, and the board must end up with EXACTLY ONE session per attempt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { Journal, type FeedEntry, type JournalOps } from '../src/journal.ts';
import { Runner } from '../src/runner.ts';
import { admit, answer, file, GRACE_MS, Lifecycle, LIVE, requestStop, step, settleTask, tick, view } from '../src/engine.ts';
import { withoutEdge } from '../src/lifecycle.ts';
import { decide, fold, nameFor, type Event, type SessionState, type Sighting } from '../src/domain.ts';
import type { SpawnRequest } from '../src/runner.ts';
import { tickMemoLayer } from '../src/tick-memo.ts';
import { composite } from '../src/runner-composite.ts';

/**
 * One board: a journal and a fake harness whose session states a test moves by hand — and the pass's memo of the settled
 * tasks it skips, in check mode: every skipped task is folded and decided all the same, and a difference fails the pass
 * (`TickMemoDiverged`), so every tick in this file proves the skip changes nothing. `memo: false` is the Effect door with
 * no memo, which folds every task.
 */
const board = (journal = Journal.test(), memo: { verify: boolean } | false = { verify: true }) => {
  const sessions = new Map<string, Sighting>();
  /** Every spawn the engine asked for, so a test can assert what the harness was TOLD. */
  const spawned: SpawnRequest[] = [];
  // The layers are values, so "restarting the engine" is just running a new program against the
  // same two — which is exactly what a new process would see. The memo survives such a restart, which a new process's
  // would not; in check mode that costs no test its proof, since every task it skips is folded again.
  const runner = Runner.test({ sessions, spawned });
  const layer = memo ? Layer.mergeAll(journal, runner, tickMemoLayer(memo)) : Layer.mergeAll(journal, runner);
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
  assert.equal(await b.run(phaseOf(id)), 'running (working)');

  // The harness finishes the work. The engine finds out by asking, not by being told.
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed' });
  await b.run(tick());

  assert.equal(await b.run(phaseOf(id)), 'succeeded');
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
  assert.equal(await b.run(phaseOf(id)), 'running (working)');
});

test('a failed attempt settles the task failed: one attempt per start, and no second session', async () => {
  const b = board();
  const id = await b.run(file(spec));

  await b.run(tick());
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed' });

  await b.run(tick());
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id)), 'failed');
  assert.equal(b.sessions.size, 1, 'trying again is the layer above\'s: it files the task again');
});

test('a blocked session is surfaced as needing a person, not as progress', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'input-required' });

  await b.run(tick());
  assert.equal(await b.run(phaseOf(id)), 'needs-human');
});

test('stop: one pass asks the harness, the next observes it and settles', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  await b.run(requestStop(id));

  // Pass one sends the request and stops there: what the harness did with it is not yet observed.
  await b.run(tick());
  assert.deepEqual([...b.sessions.values()].map((s) => s.state), ['canceled'], 'the harness was actually told');
  assert.equal(await b.run(phaseOf(id)), 'running (stopped)', 'not settled on an assumption');

  // Pass two sees it and writes it down.
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id)), 'stopped');
});

test('a pass over many tasks starts each exactly once', async () => {
  const b = board();
  const ids = await Promise.all([...Array(12)].map((_, i) => b.run(file({ ...spec, brief: `task ${i}` }))));
  await b.run(tick());
  assert.equal(b.sessions.size, 12);

  await b.run(tick());
  assert.equal(b.sessions.size, 12, 'a second pass starts nothing new');
  const views = await Promise.all(ids.map((id) => b.run(phaseOf(id))));
  assert.ok(views.every((p) => p === 'running (working)'));
});

test('a finished task settles while another waits to be admitted — settling is not an admission', async () => {
  // A queued task is checked after every terminal answer, so a board whose layer above admits nothing still drains.
  const b = board();
  const id = await b.run(file(spec));
  const waiting = await b.run(file({ ...spec, brief: 'held back', queued: true }));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed' });

  await b.run(tick());
  assert.equal(await b.run(phaseOf(id)), 'succeeded', 'settling is not an admission');
  assert.equal(await b.run(phaseOf(waiting)), 'pending', 'and nothing it was not told to start has started');
  assert.equal(b.sessions.size, 1);
});

test('the feed carries every event, in order, with a cursor that resumes', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());

  const first = await b.run(Effect.flatMap(Journal, (j) => j.feed(0)));
  assert.deepEqual(first.entries.map((e) => e.event.kind), ['filed', 'starting', 'spawned']);
  assert.ok(first.entries.every((e) => e.taskId === id));

  // Nothing new since: an empty read, and the cursor does not move.
  const again = await b.run(Effect.flatMap(Journal, (j) => j.feed(first.cursor)));
  assert.deepEqual(again.entries, []);
  assert.equal(again.cursor, first.cursor);

  // The event a workflow layer actually waits for.
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed' });
  await b.run(tick());
  const after = await b.run(Effect.flatMap(Journal, (j) => j.feed(first.cursor)));
  assert.deepEqual(after.entries.map((e) => e.event.kind), ['ended', 'settled']);
});

test('settleTask is a fixpoint: it stops when nothing moves', async () => {
  const b = board();
  const id = await b.run(file(spec));
  const actions = await b.run(Effect.flatMap(Runner, (r) => Effect.flatMap(r.observe, (o) => settleTask(id, o))));
  assert.deepEqual(actions.map((a) => a.do), ['start', 'spawn', 'nothing']);
});

const phaseOf = (id: string) =>
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


// ─── one attempt per start, end to end ──────────────────────────────────────

test('a LOST attempt settles the task failed, its session on the record for the layer above to continue', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());

  // The session vanishes from the harness entirely — nobody ever said how it ended.
  const first = [...b.sessions.keys()][0]!;
  const nativeId = b.sessions.get(first)!.nativeId!;
  b.sessions.delete(first);

  // Fast-forward past the grace window by writing the end the engine would: a test should not wait 30 real seconds.
  await b.run(Effect.flatMap(Journal, (j) => j.append(id, {
    kind: 'ended', at: new Date().toISOString(), attempt: 1, sessionId: first,
    observed: 'failed', reason: 'lost', nativeId,
  })));

  await b.run(tick());
  const { state } = await b.run(view(id, new Map()));
  assert.equal(state.settled, 'failed');
  assert.equal(b.spawned.length, 1, 'no attempt 2, resumed or clean');
  assert.equal(state.attempts[0]!.nativeId, nativeId, 'the session a new filing would continue, with `resumeFrom`');
});

test('a HARNESS failure settles the task failed, and nothing is started after it', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed' });

  await b.run(tick());
  await b.run(tick());
  assert.equal(b.spawned.length, 1);
  assert.equal((await b.run(view(id, new Map()))).state.settled, 'failed');
});

test('a journal filed before stage 4a part 2 with `maxAttempts: 2, resume: always` settles on its first failure all the same', async () => {
  const b = board();
  const id = 'legacy';
  await b.run(Effect.flatMap(Journal, (j) => j.append(id,
    { kind: 'filed', at: new Date().toISOString(), brief: 'b', cwd: '/r', maxAttempts: 2, resume: 'always' } as Event)));
  // Older than stage 4c too, with no `queued` key: it waits for the word, as the layer above now gives it.
  await b.run(tick());
  assert.equal(b.spawned.length, 0, 'a journal from before stage 4c waits to be admitted');
  await b.run(admit([id]));
  await b.run(tick());
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed' });
  await b.run(tick());
  await b.run(tick());
  assert.equal(b.spawned.length, 1);
  assert.equal((await b.run(view(id, new Map()))).state.settled, 'failed');
});

// ─── the deadline, end to end ───────────────────────────────────────────────

test('a task past its deadline is stopped and settles failed', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, deadlineSeconds: SHORT_DEADLINE }));
  await b.run(tick());
  assert.deepEqual([...b.sessions.values()].map((s) => s.state), ['working'], 'inside the deadline, it runs');
  await pastIt();

  // Pass one: the deadline is past, so the live session is stopped.
  await b.run(tick());
  assert.deepEqual([...b.sessions.values()].map((s) => s.state), ['canceled'], 'the harness was told');

  // Pass two: it is no longer live, so the task settles — as failed, not as a clean stop.
  await b.run(tick());
  const state = fold(id, await b.run(Effect.flatMap(Journal, (j) => j.read(id))));
  assert.equal(state.settled, 'failed');
});

test('a session that finished before the pass past its deadline read it settles on its end, in that one pass', async () => {
  // The 2026-09-24 check: exit 0 at 607 s of 600, recorded `ended done` and settled `failed` at the same millisecond.
  const b = board();
  const id = await b.run(file({ ...spec, deadlineSeconds: SHORT_DEADLINE }));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed', exitCode: 0 });
  await pastIt();

  const before = (await b.run(Effect.flatMap(Journal, (j) => j.read(id)))).length;
  await b.run(tick());
  const events = await b.run(Effect.flatMap(Journal, (j) => j.read(id)));
  const state = fold(id, events);
  assert.equal(state.settled, 'succeeded', 'the deadline did not overrule a session that finished');
  assert.deepEqual([state.attempts[0]!.ended, state.attempts[0]!.reason, state.attempts[0]!.exitCode], ['done', 'harness', 0]);
  assert.deepEqual(events.slice(before).map((e) => e.kind), ['ended', 'settled'], 'its end and its settle, in one pass');
});

test('a deadline ends a blocked session, which would otherwise wait on a person for ever', async () => {
  const b = board();
  await b.run(file({ ...spec, id: 'stuck', deadlineSeconds: SHORT_DEADLINE, brief: 'stuck' }));
  await b.run(tick());
  b.sessions.set(nameFor('stuck', 1), { ...b.sessions.get(nameFor('stuck', 1))!, state: 'input-required' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf('stuck')), 'needs-human', 'blocked, and before its deadline nothing ends it');
  await pastIt();

  await b.run(tick());                        // deadline stops it
  assert.equal(b.sessions.get(nameFor('stuck', 1))!.state, 'canceled');
  await b.run(tick());                        // and it settles
  assert.equal(await b.run(phaseOf('stuck')), 'failed');
});

// ─── what a pass reports, and what it no longer does ────────────────────────
// Since stage 4c part 2 (2026-09-25) the pass keeps no ceiling, no pools and no order: which task starts, and when, is the
// layer above's (`queued` and `admit`; the orchestrator's `toAdmit`). What was tested here — the ceiling, its pools, what a
// slot is held by, and which task a free one went to — is `agent-orchestrator/test/admission.test.ts`'s and `pool.test.ts`'s.

/** File `id` as of `at`: the entry `file` writes, with the time chosen by the test — or the one an older runtime wrote. */
const fileAt = (b: ReturnType<typeof board>, id: string, at: string, fields: Record<string, unknown> = {}) =>
  b.run(Effect.flatMap(Journal, (j) => j.append(id, { kind: 'filed', at, brief: id, cwd: '/repo', queued: false, ...fields } as Event)));

test('running counts the sessions at work on each harness as the pass left them: working, and started this pass — not blocked, ended or queued', async () => {
  const b = board();
  for (const id of ['c-work', 'c-block', 'c-end']) await b.run(file({ ...spec, id, harness: 'claude' }));
  await b.run(file({ ...spec, id: 'x-work', harness: 'codex' }));
  await b.run(file({ ...spec, id: 'x-queued', harness: 'codex', queued: true }));
  await b.run(file({ ...spec, id: 'no-harness' }));
  const first = await b.run(tick());
  assert.deepEqual(first.running, { claude: 3, codex: 1, default: 1 }, 'each started this pass counts, on its own harness');

  const set = (id: string, state: SessionState) => b.sessions.set(nameFor(id, 1), { ...b.sessions.get(nameFor(id, 1))!, state });
  set('c-block', 'input-required');
  set('c-end', 'completed');
  b.sessions.delete(nameFor('no-harness', 1));  // spawned, and not yet in the registry: at work as far as anyone knows
  const second = await b.run(tick());
  assert.deepEqual(second.running, { claude: 1, codex: 1, default: 1 });
  assert.equal(await b.run(phaseOf('c-end')), 'succeeded');
  assert.equal(await b.run(phaseOf('x-queued')), 'pending', 'queued, and never counted');
});

test('a pass walks the board in the order the store lists it, and starts every task not queued — the filing time and an old priority choose nothing', async () => {
  const b = board();
  // Filed by an older runtime, whose pass admitted the higher priority and then the earlier filing first under its ceiling.
  await fileAt(b, 'a', '2026-09-16T10:00:02.000Z');
  await fileAt(b, 'b', '2026-09-16T10:00:00.000Z', { priority: 5 });
  await fileAt(b, 'c', '2026-09-16T09:00:00.000Z', { priority: Number.NaN });
  const report = await b.run(tick());
  assert.deepEqual(b.spawned.map((r) => r.name), ['a', 'b', 'c'].map((id) => nameFor(id, 1)), 'the listing order, and all three');
  assert.deepEqual(report.running, { default: 3 });
  assert.equal('priority' in (await b.run(view('b', new Map()))).state, false, 'the old key is folded unread: history, not state');
  assert.equal('priority' in b.spawned[1]!, false, 'and no harness is told it');
});

test('the pass refuses any argument — an old ceiling, pools, anything — and reads nothing', async () => {
  const b = board();
  await b.run(file(spec));
  for (const args of [[3], [3, { claude: 'claude' }], [undefined]] as const) {
    // Untyped, as a caller built against the old door calls it.
    const refused = await b.run(Effect.flip((tick as (...a: unknown[]) => ReturnType<typeof tick>)(...args)));
    assert.equal(refused._tag, 'TickRefused');
    assert.match(refused.message, /^the pass takes no arguments, and was handed \d: it has no ceiling and no pools since stage 4c part 2\. File tasks `queued: true` and `admit` each/);
  }
  assert.equal(b.sessions.size, 0, 'nothing started by a refused pass');
});

test('step and settleTask refuse the ceiling\'s old slots — neither drops them, nor settles nothing on them — and journal nothing', async () => {
  const b = board();
  const id = await b.run(file(spec));
  const journalOf = async () => (await b.run(view(id, new Map()))).state.attempts.length;
  // Untyped, as a caller built against the old door calls them: `step(id, observed, slots)`, `settleTask(id, observed, slots, maxSteps)`.
  const oldStep = step as (...a: unknown[]) => ReturnType<typeof step>;
  for (const extra of [[{ used: 0, max: 3 }], [undefined], [{ used: 0, max: 3 }, 8]]) {
    const refused = await b.run(Effect.flip(oldStep(id, new Map(), ...extra)));
    assert.equal(refused._tag, 'StepRefused');
    assert.match(refused.message, new RegExp(`^step takes a task and an observation, and was handed ${extra.length} more: its third argument was the ceiling's slots`));
  }
  const oldSettle = settleTask as (...a: unknown[]) => ReturnType<typeof settleTask>;
  for (const args of [[{ used: 0, max: 3 }], [{ used: 0, max: 3 }, 8], [0], [-1], [1.5], [Number.NaN], ['8'], [null], [8, 'more']]) {
    const refused = await b.run(Effect.flip(oldSettle(id, new Map(), ...args)));
    assert.equal(refused._tag, 'StepRefused', `settleTask(id, observed, ${String(args)})`);
    assert.match(refused.message, /^settleTask takes a task, an observation and a number of steps above nought, and was handed .+: its third argument was the ceiling's slots/);
  }
  assert.equal(await journalOf(), 0, 'no attempt journalled by a refused step');
  assert.equal(b.sessions.size, 0, 'and nothing started');
  // The door as it is: two arguments step, and settleTask's own default or a count settles.
  assert.equal((await b.run(settleTask(id, new Map(), 1))).length, 1);
  assert.ok((await b.run(settleTask(id, new Map()))).length >= 1);
});

// ─── isolation ──────────────────────────────────────────────────────────────

test('worktree is declared by the task and passed to the harness untouched', async () => {
  const b = board();
  await b.run(file({ ...spec, config: { worktree: true } }));
  await b.run(tick());
  assert.equal(b.spawned.at(-1)!.config?.worktree, true);

  const c = board();
  await c.run(file({ ...spec, config: { worktree: 'my-branch' } }));
  await c.run(tick());
  assert.equal(c.spawned.at(-1)!.config?.worktree, 'my-branch');
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

  // When the harness does end it, the inherited statement is not written down as this attempt's — and this attempt,
  // having said nothing of its own, is recorded as having stated nothing: `stated: false`, which the layer above reads
  // as unsigned (stage 4a; the engine judged it `failed` itself from P0.5 until then).
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'completed' });
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, 'succeeded');
  assert.deepEqual(v.state.attempts.map((a) => [a.ended, a.reason, a.closeout, a.stated]), [['done', 'harness', undefined, false]]);
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
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'input-required', busy: false, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });

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
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'input-required', busy: false });

  assert.deepEqual(await b.run(step(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id)), 'needs-human');
});

test('blocked with an inherited statement still needs a person, and the statement is not recorded', async () => {
  const b = board();
  const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'input-required', busy: false, closeout: { payload: { outcome: 'done', by: 'parent' }, at: 0 } });

  assert.deepEqual(await b.run(step(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf(id)), 'needs-human');

  // When the harness does end it, the parent's statement is not written down as this attempt's.
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'completed' });
  const action = await b.run(step(id, new Map(b.sessions)));
  assert.ok(action.do === 'record-end');
  assert.equal(action.closeout, undefined);
  assert.equal(action.stated, false, 'nothing of its own was said');
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.equal(v.state.attempts[0]?.closeout, undefined);
  assert.equal(v.state.attempts[0]?.stated, false);
});

test('blocked and busy: a statement it may yet revise still waits', async () => {
  const b = board();
  const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'input-required', busy: true, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });

  assert.deepEqual(await b.run(step(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
  assert.equal((await b.run(view(id, new Map()))).state.settled, null);
});

test('a session the harness already ended keeps its statement on the record — unread', async () => {
  const b = board();
  const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'completed', closeout: { payload: { outcome: 'blocked' }, at: startedAt + 1000 } });
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

  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'completed' });
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.equal(v.state.settled, 'succeeded');
  assert.equal(v.state.attempts[0]?.closeout, undefined);
});

// ─── the fence and the effort: carried, never read ──────────────────────────

import fs from 'node:fs';

test('tools, disallowedTools, effort, mcp, contextTokens and Claude Code\'s own flags are declared by the task and reach every attempt untouched', async () => {
  const b = board();
  const mcp = { browser: { command: 'npx', args: ['@playwright/mcp'] } };
  // A second attempt is a held task's next turn: one attempt per start, and a turn is a start.
  const id = await b.run(file({ ...spec, holdOpen: true, config: { tools: ['Read', 'Grep'], disallowedTools: ['Bash(npm run build)'], effort: 'low', mcp, contextTokens: 200000, claude: { remoteControl: true }, budgetUsd: 0.5 } }));
  await b.run(tick());
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed', busy: false, closeout: { payload: { outcome: 'done' }, at: Date.now() + 60_000 } });
  await b.run(tick());
  await b.run(answer(id, 'again'));
  await b.run(tick());
  assert.equal(b.spawned.length, 2, 'a second turn was spawned');
  for (const r of b.spawned) {
    assert.deepEqual(r.config?.tools, ['Read', 'Grep'], 'the next turn is fenced exactly as the first attempt was');
    assert.deepEqual(r.config?.disallowedTools, ['Bash(npm run build)'], 'and denied the same');
    assert.equal(r.config?.effort, 'low');
    assert.deepEqual(r.config?.mcp, mcp, 'and given the same servers');
    assert.equal(r.config?.budgetUsd, 0.5, 'and the same cap');
    assert.equal(r.config?.contextTokens, 200000, 'and the same window: a continuation given none would run on the whole of it');
    assert.deepEqual(r.config?.claude, { remoteControl: true }, 'and bridged the same');
  }

  const plain = board();
  await plain.run(file(spec));
  await plain.run(tick());
  assert.equal(plain.spawned[0]!.config?.tools, undefined, 'no list, no fence');
  assert.equal(plain.spawned[0]!.config?.disallowedTools, undefined, 'no deny list');
  assert.equal(plain.spawned[0]!.config?.effort, undefined);
  assert.equal(plain.spawned[0]!.config?.mcp, undefined, 'no map, no servers of its own');
  assert.equal(plain.spawned[0]!.config?.budgetUsd, undefined, 'no budget, no cap');
  assert.equal(plain.spawned[0]!.config?.contextTokens, undefined, "no window: the harness's own");
  assert.equal(plain.spawned[0]!.config?.claude, undefined, 'no Remote Control unless asked');
});

test('decide never reads tools, effort, MCP servers, a budget, a context window, Remote Control, a priority an old journal carries, a filing time, usage, a cost, an exit code, an end time or what a person said — carried on the record, never judged', () => {
  // Since stage 5 the judgement is `decide`, what it reads (`lifecycleOf`, `observe`, `spawnRefused`) and the lifecycle's
  // edges, and `needsHuman` below them, the last of the file. The slice runs from `decide` to the file's end, on purpose:
  // the name it ended on, `isLive`, moved up beside the session states, and a slice to a deleted name reads -1 (CLAUDE.md).
  const source = fs.readFileSync(new URL('../src/domain.ts', import.meta.url), 'utf8');
  const from = source.indexOf('export function decide(');
  assert.ok(from >= 0, 'found decide');
  const body = source.slice(from);
  for (const name of ['export function lifecycleOf(', 'export function observe(', 'export function spawnRefused(', 'export function needsHuman(']) assert.ok(body.includes(name), `the slice holds ${name}`);
  const machine = fs.readFileSync(new URL('../src/lifecycle.ts', import.meta.url), 'utf8');
  for (const read of [body, machine]) assert.doesNotMatch(read, /\.tools|\.disallowedTools|\.effort|\.mcp\b|\.usage|\.exitCode|\.endedAt|\.said|\.budgetUsd|\.contextTokens|\.costUsd|\.remoteControl|\.claude\b|\.priority|\.filedAt/);
});

test('a session its harness ended at its budget ends failed, as its harness said, with the limit and what it cost on its attempt — and the task settles failed as any failure does', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, config: { budgetUsd: 0.01 } }));
  await b.run(tick());
  const first = [...b.sessions.keys()][0]!;
  b.sessions.set(first, { ...b.sessions.get(first)!, state: 'failed', exitCode: 1, limit: 'budget', usage: { costUsd: 0.018, apiMs: 718 } });
  for (let i = 0; i < 3; i++) await b.run(tick());

  const { state } = await b.run(view(id, new Map()));
  const [a] = state.attempts;
  assert.deepEqual([a!.ended, a!.reason, a!.limit, a!.exitCode], ['failed', 'harness', 'budget', 1], 'the limit written beside the end, off the same sighting');
  assert.deepEqual(a!.usage, { costUsd: 0.018, apiMs: 718 }, 'and what it spent getting there');
  assert.equal(state.settled, 'failed');
  assert.equal(state.attempts.length, 1, 'a budget spent is spent: no attempt 2');
  assert.equal(b.spawned.length, 1, 'and nothing spawned for one');
  const settled = (await b.run(Effect.flatMap(Journal, (j) => j.read(id)))).find((e) => e.kind === 'settled');
  assert.equal(settled?.kind === 'settled' ? settled.note : undefined, '1 attempt(s), none succeeded', 'the runtime says nothing of a budget: the layer above reads the limit');
});

// ─── usage: carried from the sighting, null when nobody measured ────────────

test('what a session consumed and how it exited go on the attempt, from the sighting that ended it', async () => {
  const b = board();
  const id = await b.run(file(spec));
  await b.run(tick());
  const usage = { turns: 3, toolCalls: 5, inputTokens: 1200, outputTokens: 80 };
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed', usage, exitCode: 0 });
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
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed', usage: { turns: 2 } });
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
  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed' }); // the fake harness measures nothing
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

  for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed' });
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
  // Exhaustive by type: a state added to `SessionState` and not here does not compile.
  const STATES: Record<SessionState, true> = {
    submitted: true, working: true, 'input-required': true, 'auth-required': true, completed: true, failed: true, canceled: true, rejected: true,
  };
  const t0 = new Date(0).toISOString();
  const inFlight = fold('t', [
    { kind: 'filed', at: t0, brief: 'b', cwd: '/r' },
    { kind: 'starting', at: t0, attempt: 1 },
    { kind: 'spawned', at: t0, attempt: 1 },
  ]);
  const waitsOn = (Object.keys(STATES) as SessionState[]).filter((state) =>
    decide(inFlight, new Map([[nameFor('t', 1), { sessionId: 's', state }]]), { at: new Date(0), graceMs: GRACE_MS }).do === 'nothing');
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

test('an unstartable attempt settles the task failed like any other failure: nothing is spawned again', async () => {
  const b = refusingBoard();
  const id = await b.run(file({ ...spec, brief: 'refuse' }));
  await b.run(tick());
  await b.run(tick());
  const v = await b.run(view(id, new Map()));
  assert.deepEqual(v.state.attempts.map((a) => a.reason), ['unstartable']);
  assert.equal(v.state.settled, 'failed');
});

test('a spawn error that does not say nothing started is recorded as spawned, and its session adopted', async () => {
  // The reviewer's case: the session exists, the spawn call failed anyway. Ending the attempt here
  // left a working session nothing would adopt, stop or bound, and a retry beside it.
  const b = refusingBoard();
  const id = await b.run(file({ ...spec, brief: 'start-then-fail' }));

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
  const later = { at: new Date(Date.now() + GRACE_MS + 1_000), graceMs: GRACE_MS };
  assert.deepEqual(decide(state, new Map(), later), { do: 'record-end', attempt: 1, sessionId: '(never seen)', observed: 'failed', reason: 'lost' });
});

test('a move the lifecycle has no edge for is on every pass\'s report while it lasts, and off it once the task moves on', async () => {
  const b = board();
  const id = await b.run(file({ ...spec, id: 'held' }));
  const other = await b.run(file({ ...spec, id: 'moving' }));
  // The shipped machine has an edge for every move a pass makes (lifecycle.test.ts), so the missing one is planted.
  const planted = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => b.run(Effect.provideService(e, Lifecycle, withoutEdge('working', 'SESSION_LIVE')));
  const first = await planted(tick());
  assert.deepEqual(first.refused, [], 'submitted → starting → working is not the missing edge');
  for (let pass = 0; pass < 3; pass++) {
    const report = await planted(tick());
    assert.deepEqual(report.refused, [{ taskId: id, state: 'working', event: 'SESSION_LIVE' }, { taskId: other, state: 'working', event: 'SESSION_LIVE' }], `pass ${pass}`);
    assert.equal(await b.run(phaseOf(id)), 'running (working)', 'and nothing was done to it');
  }
  b.sessions.set(nameFor(other, 1), { ...b.sessions.get(nameFor(other, 1))!, state: 'completed' });
  const report = await planted(tick());
  assert.deepEqual(report.refused, [{ taskId: id, state: 'working', event: 'SESSION_LIVE' }], 'an ended session has its edge, and leaves the report');
  assert.equal(await b.run(phaseOf(other)), 'succeeded');
  assert.deepEqual((await b.run(tick())).refused, [], 'the shipped machine refuses nothing');
});

test('a store of settled tasks, ticked again and again, reports no refusal — a settled task is not observed at all', async () => {
  const b = board();
  for (const id of ['done', 'broke', 'stopped']) await b.run(file({ ...spec, id }));
  await b.run(tick());
  b.sessions.set(nameFor('done', 1), { ...b.sessions.get(nameFor('done', 1))!, state: 'completed' });
  b.sessions.set(nameFor('broke', 1), { ...b.sessions.get(nameFor('broke', 1))!, state: 'failed' });
  await b.run(requestStop('stopped'));
  for (let i = 0; i < 3; i++) await b.run(tick());
  assert.deepEqual(await Promise.all(['done', 'broke', 'stopped'].map((id) => b.run(phaseOf(id)))), ['succeeded', 'failed', 'stopped']);
  // A final state has no edge, so a settled task observed would be refused on every pass: `settledQuiet` keeps it unobserved.
  for (let pass = 0; pass < 3; pass++) assert.deepEqual((await b.run(tick())).refused, [], `pass ${pass}`);
});

/**
 * A journal in memory, as `Journal.test` keeps one, that counts each task's reads — and the store's mutant: `pastTheFeed`
 * writes an entry to a task's record and not to the feed, which no writer of the runtime's does (`JournalOps.append`).
 */
const countedJournal = () => {
  const store = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  const reads = new Map<string, number>();
  const ops: JournalOps = {
    append: (taskId, event) => Effect.sync(() => {
      store.set(taskId, [...(store.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    }),
    read: (taskId) => Effect.sync(() => {
      reads.set(taskId, (reads.get(taskId) ?? 0) + 1);
      return [...(store.get(taskId) ?? [])];
    }),
    list: Effect.sync(() => [...store.keys()].sort()),
    feed: (after) => Effect.sync(() => ({ entries: feed.slice(after), cursor: feed.length })),
  };
  return {
    layer: Journal.layer(ops),
    readsOf: (id: string) => reads.get(id) ?? 0,
    pastTheFeed: (id: string, event: Event) => { store.set(id, [...(store.get(id) ?? []), event]); },
  };
};

/** `done` settled `succeeded` and `live` at work, on a board of that journal, and a pass after the settling's. */
const settledBeside = async (j: ReturnType<typeof countedJournal>, memo: { verify: boolean } | false) => {
  const b = board(j.layer, memo);
  for (const id of ['done', 'live']) await b.run(file({ ...spec, id }));
  await b.run(tick());
  b.sessions.set(nameFor('done', 1), { ...b.sessions.get(nameFor('done', 1))!, state: 'completed' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf('done')), 'succeeded');
  // The pass after the settling folds it again, since the feed names the settling: after it, nothing has.
  await b.run(tick());
  return b;
};

test('a pass skips a settled task nothing has written to since it was folded, and folds every task not settled', async () => {
  const j = countedJournal();
  const b = await settledBeside(j, { verify: false });
  const done = j.readsOf('done');
  const live = j.readsOf('live');
  for (let pass = 0; pass < 3; pass++) await b.run(tick());
  assert.equal(j.readsOf('done'), done, 'the settled task was not read again');
  assert.equal(j.readsOf('live'), live + 3 * 2, 'the task at work is folded on every pass, and read again by its step');
});

test('an entry appended to a settled task, through the feed, has the next pass fold it again — and the pass after skip it', async () => {
  const j = countedJournal();
  const b = await settledBeside(j, { verify: true });
  const before = j.readsOf('done');
  await b.run(requestStop('done'));
  await b.run(tick());
  assert.equal(j.readsOf('done'), before + 2, 'folded again, and stepped: its decision is nothing');
  await b.run(tick());
  assert.equal(j.readsOf('done'), before + 2 + 1, 'in check mode, a skip is folded once more, to prove it');
});

test('REFUSED in check mode: a pass that would skip a settled task whose journal changed past the feed fails, naming it', async () => {
  const j = countedJournal();
  const b = await settledBeside(j, { verify: true });
  j.pastTheFeed('done', { kind: 'measured', at: new Date().toISOString(), attempt: 1, usage: { costUsd: 1 } });
  await assert.rejects(b.run(tick()), (e: Error & { _tag?: string; taskId?: string }) =>
    e._tag === 'TickMemoDiverged' && e.taskId === 'done' && /the feed did not say so/.test(e.message));
});

test('the same change past the feed, without check mode, is skipped: the proof above is what would catch it', async () => {
  const j = countedJournal();
  const b = await settledBeside(j, { verify: false });
  const before = j.readsOf('done');
  j.pastTheFeed('done', { kind: 'measured', at: new Date().toISOString(), attempt: 1, usage: { costUsd: 1 } });
  await b.run(tick());
  assert.equal(j.readsOf('done'), before, 'not read: the memo trusts the feed');
});

test('a pass with no memo — the Effect door, on layers of its own — folds every task on every pass', async () => {
  const j = countedJournal();
  const b = await settledBeside(j, false);
  const before = j.readsOf('done');
  await b.run(tick());
  assert.equal(j.readsOf('done'), before + 2, 'folded, and read again by its step');
});

test('a settled task still listed is let go on every pass off what the memo kept, and what it consumed is written once', async () => {
  const j = countedJournal();
  const sessions = new Map<string, Sighting>();
  const released: string[] = [];
  // A harness that keeps a session listed after it is let go, and says what it consumed only once it has let it go.
  const runner = Runner.layer({ ...testOps({ sessions }), release: (s) => Effect.sync(() => { released.push(s.sessionId); return { costUsd: 0.5 }; }) });
  const layer = Layer.mergeAll(j.layer, runner, tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  await run(file({ ...spec, id: 'done' }));
  await run(tick());
  sessions.set(nameFor('done', 1), { ...sessions.get(nameFor('done', 1))!, state: 'completed' });
  // The settling's pass writes `measured` after it folded the task: through the feed, so the next pass folds it again, and
  // a memo that kept the fold from before would be proved stale there (`TickMemoDiverged`).
  for (let pass = 0; pass < 4; pass++) await run(tick());
  const events = await run(Effect.flatMap(Journal, (jr) => jr.read('done')));
  assert.equal(events.filter((e) => e.kind === 'measured').length, 1, 'measured once');
  assert.equal(released.length, 4, 'let go on each of the four passes that listed it');
});

test('a pass tells its runner the sessions it expects — every attempt of every task it folds, on its harness — and asks observe nothing when it can be told', async () => {
  const sessions = new Map<string, Sighting>();
  const told: string[][] = [];
  let observes = 0;
  const ops = testOps({ sessions });
  const runner = Runner.layer({
    ...ops,
    observe: Effect.suspend(() => { observes++; return ops.observe; }),
    observeFor: (expected) => Effect.suspend(() => { told.push(expected.map((e) => `${e.name}@${e.harness ?? '-'}`)); return ops.observe.pipe(Effect.map((seen) => ({ seen, unread: new Set<string>() }))); }),
  });
  const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  await run(file({ ...spec, id: 'a', harness: 'claude' }));
  await run(file({ ...spec, id: 'b', harness: 'codex' }));
  await run(tick());
  await run(tick());
  sessions.set(nameFor('a', 1), { ...sessions.get(nameFor('a', 1))!, state: 'completed' });
  for (let pass = 0; pass < 3; pass++) await run(tick());
  assert.deepEqual(told, [
    [],
    ['ae/a/1@claude', 'ae/b/1@codex'],
    ['ae/a/1@claude', 'ae/b/1@codex'],
    // Folded again on the pass after, as the feed names what its settling wrote.
    ['ae/a/1@claude', 'ae/b/1@codex'],
    ['ae/b/1@codex'],
  ], 'nothing before a spawn; both while they run; `a` while it is folded, and not once the memo keeps it');
  assert.equal(observes, 0, 'observe, told nothing, is never asked when the runner can be told');
});

test('a release the harness refuses is asked again on every pass while the harness lists the session, the task kept by the memo, and looked for no more once it is gone', async () => {
  const sessions = new Map<string, Sighting>();
  const told: string[][] = [];
  const asked: number[] = [];
  let refusals = 3;
  let pass = 0;
  const ops = testOps({ sessions });
  // Like Claude Code's for a background session: it lists only what it is told to look for, and lets a session go by removing it.
  const runner = Runner.layer({
    ...ops,
    observeFor: (expected) => Effect.sync(() => {
      told.push(expected.map((e) => e.name));
      return { seen: new Map([...sessions].filter(([name]) => expected.some((e) => e.name === name))), unread: new Set<string>() };
    }),
    release: (s) => Effect.suspend(() => {
      asked.push(pass);
      if (refusals-- > 0) return Effect.fail(new RunnerError({ verb: 'release', message: 'claude rm: registry busy' }));
      for (const [name, listed] of sessions) if (listed.sessionId === s.sessionId) sessions.delete(name);
      return Effect.succeed(undefined);
    }),
  });
  const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file({ ...spec, harness: 'claude' }));
  await run(tick());
  const name = nameFor(id, 1);
  sessions.set(name, { ...sessions.get(name)!, state: 'completed' });
  for (pass = 1; pass <= 7; pass++) await run(tick());
  assert.equal((await run(view(id, new Map()))).state.settled, 'succeeded');
  // Settled on pass 1, folded again on 2 as the feed names what its settling wrote, and kept from 3 on: refused on 1 to 3,
  // let go on 4, seen gone on 5, and not looked for after.
  assert.deepEqual(asked, [1, 2, 3, 4], 'asked on every pass that listed it, the passes the memo kept the task included');
  assert.deepEqual(told.slice(1).map((names) => names.includes(name)), [true, true, true, true, true, false, false],
    'looked for while listed, once more to see it gone, and then no more');
});

test("a pass's views are what `view` reads after it: an attempt's measure, written by this pass's release, is on the view it reports", async () => {
  const sessions = new Map<string, Sighting>();
  const layer = Layer.mergeAll(Journal.test(), Runner.layer({ ...testOps({ sessions }), release: () => Effect.succeed({ costUsd: 0.5 }) }), tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file({ ...spec, holdOpen: true, closeoutSchema: SCHEMA }));
  await run(tick());
  const name = nameFor(id, 1);
  const startedAt = Date.parse((await run(view(id, new Map()))).state.attempts[0]!.startedAt);
  sessions.set(name, { ...sessions.get(name)!, state: 'completed', closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });
  const report = await run(tick());
  const reported = report.views.find((v) => v.id === id);
  assert.equal(reported?.phase, 'input-required', 'held open: unsettled, so on the report');
  assert.equal(reported?.state.attempts[0]?.usage?.costUsd, 0.5, 'with what the release measured on this pass');
  assert.deepEqual(reported, await run(view(id, new Map(sessions))));
});

/**
 * A harness behind the composite, as `createEngine` puts every harness, whose reads fail on the passes a test chooses: the
 * failure the composite answers for, as a `claude agents` timing out is. Lists only what it is told to look for.
 */
const flakyHarness = (sessions: Map<string, Sighting>, readFails: () => boolean) => {
  const ops = testOps({ sessions });
  const read = (expected?: readonly { name: string }[]) => Effect.suspend(() => readFails()
    ? Effect.fail(new RunnerError({ verb: 'observe', message: 'claude agents: timed out' }))
    : Effect.succeed(new Map([...sessions].filter(([name]) => !expected || expected.some((e) => e.name === name)))));
  // A read that fails fails whole, as a registry that timed out does: the composite says the names it was to find unread.
  return { ...ops, observe: read(), observeFor: (expected: readonly { name: string }[]) => read(expected).pipe(Effect.map((seen) => ({ seen, unread: new Set<string>() }))) };
};

test('a release refused, then one pass that could not read the harness: the release is asked again on the next good pass, since a failed read is not the session gone', async () => {
  const sessions = new Map<string, Sighting>();
  const asked: number[] = [];
  let refusals = 3;
  let pass = 0;
  const runner = Runner.layer(composite({
    claude: {
      ...flakyHarness(sessions, () => pass === 4),
      release: (s) => Effect.suspend(() => {
        asked.push(pass);
        if (refusals-- > 0) return Effect.fail(new RunnerError({ verb: 'release', message: 'claude rm: registry busy' }));
        for (const [name, listed] of sessions) if (listed.sessionId === s.sessionId) sessions.delete(name);
        return Effect.succeed(undefined);
      }),
    },
  }, 'claude'));
  const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file({ ...spec, harness: 'claude' }));
  await run(tick());
  const name = nameFor(id, 1);
  sessions.set(name, { ...sessions.get(name)!, state: 'completed' });
  for (pass = 1; pass <= 6; pass++) await run(tick());
  assert.equal((await run(view(id, new Map()))).state.settled, 'succeeded');
  // Settled on pass 1 and kept from 3: refused on 1 to 3, not read on 4, let go on 5.
  assert.deepEqual(asked, [1, 2, 3, 5], 'the pass that could not read asked nothing, and the next good one asked again');
  assert.equal(sessions.has(name), false, 'and the session was let go');
});

test('a pass that could not read the harness does not end an attempt `lost`, its grace long past: the next good read follows it', async () => {
  const sessions = new Map<string, Sighting>();
  let failing = true;
  const layer = Layer.mergeAll(Journal.test(), Runner.layer(composite({ claude: flakyHarness(sessions, () => failing) }, 'claude')), tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file({ ...spec, harness: 'claude' }));
  // Spawned twice the grace ago, by an engine before this one, and running under its name since.
  const long = new Date(Date.now() - 2 * GRACE_MS).toISOString();
  await run(Effect.flatMap(Journal, (j) => Effect.all([
    j.append(id, { kind: 'starting', at: long, attempt: 1 }),
    j.append(id, { kind: 'spawned', at: long, attempt: 1 }),
  ], { discard: true })));
  sessions.set(nameFor(id, 1), { sessionId: 'kept', state: 'working', nativeId: 'kept' });
  await run(tick());
  const events = await run(Effect.flatMap(Journal, (j) => j.read(id)));
  assert.equal(events.some((e) => e.kind === 'ended' || e.kind === 'settled'), false, 'nothing ended on a read that failed');
  failing = false;
  await run(tick());
  const v = await run(view(id, new Map(sessions)));
  assert.equal(v.state.attempts[0]!.ended, null);
  assert.equal(v.phase, 'running (working)', 'followed as it runs');
});

test('a pass that could not read the harness does not spawn again an intent a crash left with no spawn on the record: the next good read adopts the session', async () => {
  const sessions = new Map<string, Sighting>();
  const spawns: string[] = [];
  let failing = true;
  const flaky = flakyHarness(sessions, () => failing);
  const claude = { ...flaky, spawn: (r: Parameters<typeof flaky.spawn>[0]) => Effect.suspend(() => { spawns.push(r.name); return flaky.spawn(r); }) };
  const layer = Layer.mergeAll(Journal.test(), Runner.layer(composite({ claude }, 'claude')), tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file({ ...spec, harness: 'claude' }));
  // The intent journalled and the session started, and the engine gone before its `spawned` line.
  await run(Effect.flatMap(Journal, (j) => j.append(id, { kind: 'starting', at: new Date().toISOString(), attempt: 1 })));
  sessions.set(nameFor(id, 1), { sessionId: 'kept', state: 'working', nativeId: 'kept' });
  await run(tick());
  assert.deepEqual(spawns, [], 'not spawned a second time under its name on a read that failed');
  const events = await run(Effect.flatMap(Journal, (j) => j.read(id)));
  assert.equal(events.some((e) => e.kind === 'ended' || e.kind === 'settled'), false, 'nor ended');
  failing = false;
  await run(tick());
  assert.deepEqual(spawns, [], 'the next good read finds the session under the name');
  const v = await run(view(id, new Map(sessions)));
  assert.equal(v.state.attempts[0]!.ended, null);
  assert.equal(v.phase, 'running (working)', 'adopted, and followed as it runs');
});

test('a task on a harness this engine does not have is never spawned on the fallback, and one in flight is not ended `lost`, its grace long past', async () => {
  const sessions = new Map<string, Sighting>();
  const spawns: string[] = [];
  const told: string[] = [];
  const ops = testOps({ sessions });
  // The fallback records what it is handed and told to look for: a task on a remote agent the engine was made without is neither.
  const claude = {
    ...ops,
    spawn: (r: SpawnRequest) => Effect.suspend(() => { spawns.push(r.name); return ops.spawn(r); }),
    observeFor: (expected: readonly { name: string }[]) => Effect.sync(() => { told.push(...expected.map((e) => e.name)); return { seen: new Map(sessions), unread: new Set<string>() }; }),
  };
  const layer = Layer.mergeAll(Journal.test(), Runner.layer(composite({ claude }, 'claude')), tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  // Filed by an engine that had `a2a:reviewer`: one ready to start, one spawned twice the grace ago and at work on the agent since.
  const ready = await run(file({ ...spec, harness: 'a2a:reviewer' }));
  const away = await run(file({ ...spec, harness: 'a2a:reviewer' }));
  const long = new Date(Date.now() - 2 * GRACE_MS).toISOString();
  await run(Effect.flatMap(Journal, (j) => Effect.all([
    j.append(away, { kind: 'starting', at: long, attempt: 1 }),
    j.append(away, { kind: 'spawned', at: long, attempt: 1 }),
  ], { discard: true })));
  await run(tick());
  await run(tick());
  assert.deepEqual(spawns, [], 'nothing was spawned on the fallback');
  assert.deepEqual(told, [], 'nor was the fallback told to look for a session of either');
  const readyEvents = await run(Effect.flatMap(Journal, (j) => j.read(ready)));
  const end = readyEvents.find((e) => e.kind === 'ended');
  assert.ok(end?.kind === 'ended' && end.reason === 'unstartable' && /`harness: a2a:reviewer` is not a harness this engine has, so nothing was started/.test(end.error ?? ''), JSON.stringify(readyEvents));
  const awayEvents = await run(Effect.flatMap(Journal, (j) => j.read(away)));
  assert.equal(awayEvents.some((e) => e.kind === 'ended' || e.kind === 'settled'), false, `neither there nor gone, so not ended: ${JSON.stringify(awayEvents)}`);
});
