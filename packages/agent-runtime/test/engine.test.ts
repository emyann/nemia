/**
 * The engine against a harness that costs nothing.
 *
 * The tests that matter here are the crash ones: the engine is killed at each point in the
 * sequence and restarted, and the board must end up with EXACTLY ONE session per attempt.
 *
 * What Claude Code does, which the closing-statement tests stand on:
 *
 * - a session stays `working` after calling StructuredOutput;
 * - a resumed session's transcript holds its parent's whole conversation under the child's own session id, so a parent's
 *   StructuredOutput call looks exactly like the child's, and only when it was made tells them apart;
 * - a session that declared itself done while still busy can go on, and rewrite its verdict;
 * - a `claude --bg` session that called StructuredOutput and ended its turn can be observed blocked and idle, and a statement
 *   read there as an answer already given would leave it needing a person for ever.
 *
 * The judgement is `decide` in `domain.ts` — what it reads (`lifecycleOf`, `observe`, `spawnRefused`) and `needsHuman`, last in
 * the file — and the lifecycle's edges: the test that it reads no carried field slices `domain.ts` from `decide` to the file's
 * end, so no name moved or deleted below it can cut the slice short.
 *
 * The file tells the engine's pass as stories — a job to its release, a stop, a deadline, the ways a start fails, a long-lived
 * session across restarts — and as tables whose rows each build their own board: what a pass carries and reports, the crash
 * windows, the closing statement as the engine judges it, what the pass refuses, the memo, the release and a harness unread.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Effect, Layer } from 'effect';
import { Journal, type FeedEntry, type JournalOps } from '../src/core/engine/journal.ts';
import { Runner, RunnerError, testOps, type ExpectedSession } from '../src/harness/seam.ts';
import { admit, answer, file, requestStop } from '../src/core/engine/filing.ts';
import { GRACE_MS, Lifecycle, LIVE, reconcile, settleTask, tick, view } from '../src/core/engine/engine.ts';
import { withoutEdge } from '../src/core/lifecycle.ts';
import { decide, fold, nameFor, RESTART_WORDS, type Event, type Sighting } from '../src/core/domain.ts';
import type { SessionState } from '../src/core/session.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { tickMemoLayer } from '../src/core/engine/memo.ts';
import { composite } from '../src/harness/seam.ts';
import { monoNow } from '../src/core/engine/now.ts';
import { engineAt } from '../src/cli/main.ts';
import { stepClock } from './clock.ts';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';

/**
 * One board: a journal and a fake harness whose session states a test moves by hand — and the pass's memo of the settled
 * tasks it skips, in check mode: every skipped task is folded and decided all the same, and a difference fails the pass
 * (`TickMemoDiverged`), so every tick in this file proves the skip changes nothing. `memo: false` is the Effect door with
 * no memo, which folds every task.
 *
 * Returns the harness's `sessions`, `spawned` — every spawn the engine asked for, so a test can assert what the harness was
 * TOLD — and `run`. The layers are values, so "restarting the engine" is running a new program against the same two, which
 * is what a new process sees. The memo survives such a restart, which a new process's does not; in check mode that costs no
 * test its proof, since every task it skips is folded again.
 */
const board = (journal = Journal.test(), memo: { verify: boolean } | false = { verify: true }) => {
  const sessions = new Map<string, Sighting>();
  const spawned: SpawnRequest[] = [];
  const runner = Runner.test({ sessions, spawned });
  const layer = memo ? Layer.mergeAll(journal, runner, tickMemoLayer(memo)) : Layer.mergeAll(journal, runner);
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  return { sessions, spawned, run };
};

const spec = { brief: 'do the thing', cwd: '/repo' };

/**
 * A deadline far from any boundary on either side: ten minutes, met by a task started now, which runs well inside it, and by one
 * whose attempt the journal says began twice that long ago (`startedLongAgo`), well past it. No test waits for a deadline to
 * pass: a wall clock stepped back during the wait would leave it unreached, and one stepped forward would end the fresh one.
 */
const DEADLINE_SECONDS = 600;

/**
 * Journals attempt 1 of `id` as begun and spawned twice its deadline ago, and puts its session on the board's harness, working.
 */
const startedLongAgo = async (b: ReturnType<typeof board>, id: string) => {
  const at = new Date(Date.now() - 2 * DEADLINE_SECONDS * 1000).toISOString();
  await b.run(
    Effect.flatMap(Journal, (j) =>
      Effect.all([j.append(id, { kind: 'starting', at, attempt: 1 }), j.append(id, { kind: 'spawned', at, attempt: 1 })], {
        discard: true,
      }),
    ),
  );
  b.sessions.set(nameFor(id, 1), { sessionId: `old-${id}`, state: 'working', nativeId: `old-${id}` });
};

/**
 * A board whose harness says what it was asked to stop and release, run by a fresh daemon on each call of `daemon`: a new
 * process on the same journal and harness. A release is recorded only, so a released session stays listed as it was.
 */
const recording = () => {
  const journal = Journal.test();
  const sessions = new Map<string, Sighting>();
  const spawned: SpawnRequest[] = [];
  const asked: string[] = [];
  const daemon = () => {
    const ops = testOps({ sessions, spawned });
    const runner = Runner.layer({
      ...ops,
      stop: (id) =>
        Effect.andThen(
          Effect.sync(() => asked.push(`stop ${id}`)),
          ops.stop(id),
        ),
      release: (s) => Effect.sync(() => void asked.push(`release ${s.sessionId}`)),
    });
    const layer = Layer.mergeAll(journal, runner, tickMemoLayer({ verify: true }));
    return <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  };
  return { sessions, spawned, asked, daemon };
};

/** Appends `events` to `id`'s journal, each stamped `ago` ms before now. */
const journalAgo = (id: string, ...events: Array<[number, Record<string, unknown>]>) =>
  Effect.flatMap(Journal, (j) =>
    Effect.forEach(events, ([ago, e]) => j.append(id, { ...e, at: new Date(Date.now() - ago).toISOString() } as Event), {
      discard: true,
    }),
  );

const kindsOf = (id: string) =>
  Effect.map(
    Effect.flatMap(Journal, (j) => j.read(id)),
    (events) => events.map((e) => e.kind),
  );

const eventsOf = (id: string) => Effect.flatMap(Journal, (j) => j.read(id));

const phaseOf = (id: string) => Effect.flatMap(Runner, (r) => Effect.flatMap(r.observe, (o) => Effect.map(view(id, o), (v) => v.phase)));

/**
 * File `id` as of `at`: the entry `file` writes, with the time chosen by the test — or the one an older runtime wrote, with a
 * `priority` JSON wrote `null` for.
 *
 * Which queued task a pass admits under the engine's ceiling, in which pool and in which order, is `test/admission.test.ts`'s.
 */
const fileAt = (b: ReturnType<typeof board>, id: string, at: string, fields: Record<string, unknown> = {}) =>
  b.run(Effect.flatMap(Journal, (j) => j.append(id, { kind: 'filed', at, brief: id, cwd: '/repo', queued: false, ...fields })));

const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' } }, required: ['outcome'] };

/** File a task and get its first attempt as far as the harness. */
const running = async (b: ReturnType<typeof board>, s: Parameters<typeof file>[0]) => {
  const id = await b.run(file(s));
  await b.run(tick());
  const startedAt = Date.parse((await b.run(view(id, new Map()))).state.attempts[0].startedAt);
  return { id, name: nameFor(id, 1), startedAt };
};

test('a job runs to its end: filed, spawned once, running, ended on what its harness says, settled — each step on the feed, in order', async (t) => {
  const s = story(t);
  const b = board();
  const usage = { turns: 3, toolCalls: 5, inputTokens: 1200, outputTokens: 80 };
  let id = '';
  let cursor = 0;

  await s.test(
    'the first pass starts exactly one session, under the name the journal implies, stamped on the monotonic clock of this boot',
    async () => {
      id = await b.run(file(spec));
      await b.run(tick());
      assert.equal(b.sessions.size, 1, 'exactly one session was started');
      assert.ok(b.sessions.has(nameFor(id, 1)), 'the session carries the name the journal implies');
      assert.equal(await b.run(phaseOf(id)), 'working');
      const events = await b.run(eventsOf(id));
      const starting = events.find((e) => e.kind === 'starting');
      const spawned = events.find((e) => e.kind === 'spawned');
      assert.ok(starting?.kind === 'starting' && spawned?.kind === 'spawned', 'started and spawned');
      assert.equal(starting.mono?.boot, monoNow()?.boot, 'the start is stamped in this boot');
      assert.equal(spawned.mono?.boot, monoNow()?.boot, 'the spawn is stamped in this boot');
      assert.ok(spawned.mono!.ms >= starting.mono!.ms, 'and later on that clock');
    },
  );

  await s.test('the feed carries filed, starting and spawned, and a read from its cursor is empty, the cursor unmoved', async () => {
    const first = await b.run(Effect.flatMap(Journal, (j) => j.feed(0)));
    assert.deepEqual(
      first.entries.map((e) => e.event.kind),
      ['filed', 'starting', 'spawned'],
    );
    assert.ok(first.entries.every((e) => e.taskId === id));
    cursor = first.cursor;
    const again = await b.run(Effect.flatMap(Journal, (j) => j.feed(cursor)));
    assert.deepEqual(again.entries, [], 'nothing new since: an empty read');
    assert.equal(again.cursor, cursor, 'and the cursor does not move');
  });

  await s.test('in flight, its attempt has not ended', async () => {
    assert.equal((await b.run(view(id, new Map()))).state.attempts[0].endedAt, null);
  });

  await s.test('five passes more, each a restart on the same journal, adopt the running session and start nothing', async () => {
    const before = [...b.sessions.keys()];
    for (let i = 0; i < 5; i++) await b.run(tick());
    assert.deepEqual([...b.sessions.keys()], before, 'no second session, five restarts later');
    assert.equal(await b.run(phaseOf(id)), 'working');
  });

  await s.test(
    'its harness says it completed: the pass settles it succeeded, finding out by asking, with what it consumed and how it exited',
    async () => {
      for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed', usage, exitCode: 0 });
      await b.run(tick());
      assert.equal(
        await b.run(phaseOf(id)),
        'succeeded',
        'the harness finished the work: the engine finds out by asking, not by being told',
      );
      assert.equal(b.sessions.size, 1, 'and never started a second one');
      const [a] = (await b.run(view(id, new Map()))).state.attempts;
      assert.deepEqual(a.usage, usage, 'what it consumed, from the sighting that ended it');
      assert.equal(a.exitCode, 0, 'and how it exited');
    },
  );

  await s.test('the settled view carries when its attempt ended, as journalled, after it started', async () => {
    const v = await b.run(view(id, new Map()));
    const ended = (await b.run(eventsOf(id))).find((e) => e.kind === 'ended');
    assert.equal(v.state.settled, 'succeeded');
    assert.ok(ended, 'the end was journalled');
    assert.equal(v.state.attempts[0].endedAt, ended.at);
    assert.ok(Date.parse(v.state.attempts[0].startedAt) <= Date.parse(ended.at), 'and it ended after it started');
  });

  await s.test('the feed from its cursor carries the end and the settling, the events a workflow layer waits for', async () => {
    const after = await b.run(Effect.flatMap(Journal, (j) => j.feed(cursor)));
    assert.deepEqual(
      after.entries.map((e) => e.event.kind),
      ['ended', 'settled'],
    );
  });
});

test('tick: what a pass starts, carries to its harness untouched, and reports', async (t) => {
  await t.test('a pass over many tasks starts each exactly once, and a second pass starts nothing new', async () => {
    const b = board();
    const ids = await Promise.all([...Array(12)].map((_, i) => b.run(file({ ...spec, brief: `task ${i}` }))));
    await b.run(tick());
    assert.equal(b.sessions.size, 12);
    await b.run(tick());
    assert.equal(b.sessions.size, 12, 'a second pass starts nothing new');
    const views = await Promise.all(ids.map((id) => b.run(phaseOf(id))));
    assert.ok(views.every((p) => p === 'working'));
  });

  await t.test(
    'a finished task settles while another waits to be admitted — settling is not an admission, and a board whose layer above admits nothing still drains',
    async () => {
      const b = board();
      const id = await b.run(file(spec));
      const waiting = await b.run(file({ ...spec, brief: 'held back', queued: true }));
      await b.run(tick());
      for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed' });
      await b.run(tick());
      assert.equal(await b.run(phaseOf(id)), 'succeeded', 'settling is not an admission');
      assert.equal(await b.run(phaseOf(waiting)), 'pending', 'and nothing it was not told to start has started');
      assert.equal(b.sessions.size, 1);
    },
  );

  await t.test(
    'running counts the sessions at work on each harness as the pass left them: working, and started this pass — not blocked, ended or queued',
    async () => {
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
      b.sessions.delete(nameFor('no-harness', 1));
      const second = await b.run(tick());
      assert.deepEqual(
        second.running,
        { claude: 1, codex: 1, default: 1 },
        '`no-harness`, spawned and not yet in the registry, is at work as far as anyone knows',
      );
      assert.equal(await b.run(phaseOf('c-end')), 'succeeded');
      assert.equal(await b.run(phaseOf('x-queued')), 'pending', 'queued, and never counted');
    },
  );

  await t.test(
    'a pass walks the board in the order the store lists it, and starts every task not queued — the filing time and a priority choose nothing',
    async () => {
      const b = board();
      await fileAt(b, 'a', '2026-09-16T10:00:02.000Z');
      await fileAt(b, 'b', '2026-09-16T10:00:00.000Z', { priority: 5 });
      await fileAt(b, 'c', '2026-09-16T09:00:00.000Z', { priority: null });
      const report = await b.run(tick());
      assert.deepEqual(
        b.spawned.map((r) => r.name),
        ['a', 'b', 'c'].map((id) => nameFor(id, 1)),
        'the listing order, and all three',
      );
      assert.deepEqual(report.running, { default: 3 });
      assert.equal((await b.run(view('b', new Map()))).state.priority, 5, 'a priority is carried on the record');
      assert.equal('priority' in (await b.run(view('c', new Map()))).state, false, 'and one JSON wrote `null` for is left out: 0');
      assert.equal('priority' in b.spawned[1], false, 'and no harness is told it');
    },
  );

  await t.test('worktree is declared by the task and passed to the harness untouched', async () => {
    const b = board();
    await b.run(file({ ...spec, config: { worktree: true } }));
    await b.run(tick());
    assert.equal(b.spawned.at(-1)!.config?.worktree, true);

    const c = board();
    await c.run(file({ ...spec, config: { worktree: 'my-branch' } }));
    await c.run(tick());
    assert.equal(c.spawned.at(-1)!.config?.worktree, 'my-branch');
  });

  await t.test('the closeout schema reaches the harness verbatim — the engine never learns its shape', async () => {
    const b = board();
    await running(b, { ...spec, closeoutSchema: SCHEMA });
    assert.deepEqual(b.spawned[0]?.closeoutSchema, SCHEMA);
  });

  await t.test(
    "tools, disallowedTools, effort, mcp, contextTokens and Claude Code's own flags are declared by the task and reach every attempt untouched",
    async () => {
      const b = board();
      const mcp = { browser: { command: 'npx', args: ['@playwright/mcp'] } };
      const id = await b.run(
        file({
          ...spec,
          holdOpen: true,
          config: {
            tools: ['Read', 'Grep'],
            disallowedTools: ['Bash(npm run build)'],
            effort: 'low',
            mcp,
            contextTokens: 200000,
            claude: { remoteControl: true },
            budgetUsd: 0.5,
          },
        }),
      );
      await b.run(tick());
      const began = Date.parse((await b.run(view(id, new Map()))).state.attempts[0].startedAt);
      for (const [k, v] of b.sessions)
        b.sessions.set(k, { ...v, state: 'completed', busy: false, closeout: { payload: { outcome: 'done' }, at: began + 1_000 } });
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
      assert.equal(plain.spawned[0].config?.tools, undefined, 'no list, no fence');
      assert.equal(plain.spawned[0].config?.disallowedTools, undefined, 'no deny list');
      assert.equal(plain.spawned[0].config?.effort, undefined);
      assert.equal(plain.spawned[0].config?.mcp, undefined, 'no map, no servers of its own');
      assert.equal(plain.spawned[0].config?.budgetUsd, undefined, 'no budget, no cap');
      assert.equal(plain.spawned[0].config?.contextTokens, undefined, "no window: the harness's own");
      assert.equal(plain.spawned[0].config?.claude, undefined, 'no Remote Control unless asked');
    },
  );

  await t.test('an attempt nobody measured records null — not zeros that would read as free', async () => {
    const b = board();
    const id = await b.run(file(spec));
    await b.run(tick());
    for (const [k, v] of b.sessions) b.sessions.set(k, { ...v, state: 'completed' });
    await b.run(tick());
    const [a] = (await b.run(view(id, new Map()))).state.attempts;
    assert.equal(a.usage, null, 'the fake harness measures nothing');
    assert.equal(a.exitCode, null);
  });

  await t.test('settleTask is a fixpoint: it stops when nothing moves', async () => {
    const b = board();
    const id = await b.run(file(spec));
    const actions = await b.run(Effect.flatMap(Runner, (r) => Effect.flatMap(r.observe, (o) => settleTask(id, o))));
    assert.deepEqual(
      actions.map((a) => a.do),
      ['start', 'spawn', 'nothing'],
    );
  });
});

test('the crash windows: the engine dies at each point of a start, and the restart makes exactly one session per attempt', async (t) => {
  await t.test('CRASH between minting the id and spawning: the restart spawns that same id, once', async () => {
    const b = board();
    const id = await b.run(file(spec));
    const first = await b.run(reconcile(id, new Map()));
    assert.equal(first.do, 'start', 'one step only journals `starting`, and the process dies before the spawn');
    assert.equal(b.sessions.size, 0, 'nothing was spawned');
    await b.run(tick());
    assert.equal(b.sessions.size, 1, 'a new engine on the same journal spawns the name the intent implies, and invents no second');
    assert.ok(b.sessions.has(nameFor(id, 1)), 'the session carries the name the journal implies');
  });

  await t.test(
    'ADOPTION: a session already running under our name is adopted, not duplicated — the spawn happened, and a crash ate the journal entry that records it',
    async () => {
      const b = board();
      const id = await b.run(file(spec));
      await b.run(reconcile(id, new Map()));
      b.sessions.set(nameFor(id, 1), { sessionId: 'orphan', state: 'working' });
      await b.run(tick());
      assert.equal(b.sessions.size, 1, 'the orphan was adopted, not duplicated');
      assert.equal(b.sessions.get(nameFor(id, 1))!.sessionId, 'orphan');
    },
  );

  await t.test(
    'a spawn error that does not say nothing started is recorded as spawned, and its session adopted — and stopped as any session the engine knows',
    async () => {
      const b = refusingBoard();
      const id = await b.run(file({ ...spec, brief: 'start-then-fail' }));
      await b.run(tick());
      let v = await b.run(view(id, new Map()));
      assert.equal(v.state.settled, null, 'not failed: a session may exist under the name');
      assert.equal(v.state.attempts.length, 1, 'and no second attempt beside it');
      assert.ok(v.state.attempts[0].spawnedAt, 'recorded as spawned, so the grace window applies');
      assert.match(v.state.attempts[0].error ?? '', /lost the acknowledgement/);

      await b.run(tick());
      assert.equal((await b.run(view(id, await b.run(Effect.flatMap(Runner, (r) => r.observe))))).phase, 'working', 'adopted');

      await b.run(requestStop(id));
      await b.run(tick());
      await b.run(tick());
      v = await b.run(view(id, new Map()));
      assert.equal(v.state.settled, 'stopped', 'stop reaches it, as it reaches any session the engine knows');
      assert.equal(b.sessions.size, 1, 'one session, ever');
    },
  );

  await t.test('...and when no session shows up, the grace window ends it lost, as for any spawn never registered', async () => {
    const b = board();
    const id = await b.run(file(spec));
    await b.run(reconcile(id, new Map()));
    const spawnedAt = new Date().toISOString();
    await b.run(
      Effect.flatMap(Journal, (j) =>
        j.append(id, { kind: 'spawned', at: spawnedAt, attempt: 1, error: 'launcher: lost the acknowledgement' }),
      ),
    );
    const state = fold(id, await b.run(eventsOf(id)));
    const later = { at: new Date(Date.parse(spawnedAt) + GRACE_MS + 1_000), graceMs: GRACE_MS };
    assert.deepEqual(decide(state, new Map(), later), {
      do: 'record-end',
      attempt: 1,
      sessionId: '(never seen)',
      observed: 'failed',
      reason: 'lost',
    });
  });

  await t.test(
    'a session spawned and not yet listed by its harness is in its grace, however far the wall clock steps forward',
    async (sub) => {
      const b = board();
      const id = await b.run(file(spec));
      await b.run(tick());
      b.sessions.delete(nameFor(id, 1));
      stepClock(sub, GRACE_MS + 30_000);
      await b.run(tick());
      const [attempt] = (await b.run(view(id, new Map()))).state.attempts;
      assert.equal(attempt?.ended, null, 'not ended `lost`: on the monotonic clock its grace has barely begun');
    },
  );
});

test('a person stops a running job: the harness is told, the next pass settles it — and a stop of what cannot stop is refused, journalling nothing', async (t) => {
  const s = story(t);
  const b = board();
  const entries = async (id: string) => (await b.run(eventsOf(id))).length;
  let before = { done: 0, asked: 0 };

  await s.test(
    'asked to stop, the next pass tells its harness and settles nothing on an assumption, while the tasks beside it end',
    async () => {
      for (const id of ['done', 'broke', 'asked']) await b.run(file({ ...spec, id }));
      await b.run(tick());
      b.sessions.set(nameFor('done', 1), { ...b.sessions.get(nameFor('done', 1))!, state: 'completed' });
      b.sessions.set(nameFor('broke', 1), { ...b.sessions.get(nameFor('broke', 1))!, state: 'failed' });
      await b.run(requestStop('asked'));
      await b.run(tick());
      assert.equal(b.sessions.get(nameFor('asked', 1))?.state, 'canceled', 'the harness was actually told');
      assert.equal(await b.run(phaseOf('asked')), 'ending', 'not settled on an assumption');
      assert.deepEqual(
        [...b.sessions.keys()].sort(),
        ['asked', 'broke', 'done'].map((id) => nameFor(id, 1)).sort(),
        'the stop pass started no session',
      );
    },
  );

  await s.test('asked again before it has settled, the stop is StopRefused, and nothing is journalled', async () => {
    before = { done: await entries('done'), asked: await entries('asked') };
    const refused = await b.run(Effect.flip(requestStop('asked')));
    assert.equal(refused._tag, 'StopRefused');
    assert.match(refused.message, /^`asked` has been asked to stop already/);
    assert.match(refused.message, /`ae ls`/, 'naming where to see it settle');
    assert.equal(await entries('asked'), before.asked);
  });

  await s.test('the pass after sees it canceled and writes it down: stopped', async () => {
    await b.run(tick());
    assert.equal(await b.run(phaseOf('asked')), 'stopped', 'the second pass sees it and writes it down');
    assert.deepEqual(
      [...b.sessions.keys()].sort(),
      ['asked', 'broke', 'done'].map((id) => nameFor(id, 1)).sort(),
      'nor did the pass that settled it',
    );
    before = { done: await entries('done'), asked: await entries('asked') };
  });

  await s.test(
    'a stop of a settled task, or of one not on the board, is StopRefused naming the fix, and nothing is journalled nor a record made',
    async () => {
      assert.equal(await b.run(phaseOf('done')), 'succeeded');
      const cases: Array<[string, RegExp, RegExp]> = [
        ['done', /^`done` has settled \(succeeded\)/, /`resumeFrom`/],
        ['asked', /^`asked` has settled \(stopped\)/, /`resumeFrom`/],
        ['nope', /^`nope` is not a task on this board/, /`ae ls`/],
      ];
      for (const [id, fact, fix] of cases) {
        const refused = await b.run(Effect.flip(requestStop(id)));
        assert.equal(refused._tag, 'StopRefused', id);
        assert.match(refused.message, fact, id);
        assert.match(refused.message, fix, id);
      }
      assert.deepEqual(
        { done: await entries('done'), asked: await entries('asked'), nope: await entries('nope') },
        { ...before, nope: 0 },
        'nothing journalled for any of them, and no record made for a task never filed',
      );
    },
  );

  await s.test(
    'a store of settled tasks, ticked again and again, reports no refusal — a settled task is not observed at all, where its final state, which has no edge, would refuse every event',
    async () => {
      assert.deepEqual(await Promise.all(['done', 'broke', 'asked'].map((id) => b.run(phaseOf(id)))), ['succeeded', 'failed', 'stopped']);
      for (let pass = 0; pass < 3; pass++) assert.deepEqual((await b.run(tick())).refused, [], `pass ${pass}`);
    },
  );
});

test('a deadline: past it a session working or blocked is stopped and settles failed, inside it one runs on and one waits on a person, and an end read in the same pass wins', async (t) => {
  const s = story(t);
  const b = board();
  const blocked = (id: string) => b.sessions.set(nameFor(id, 1), { ...b.sessions.get(nameFor(id, 1))!, state: 'input-required' });
  let finishedBefore = 0;

  await s.test('one pass: past its deadline a working session and a blocked one are stopped; inside it, a session runs', async () => {
    for (const id of ['fresh', 'late', 'finished', 'stuck', 'waiting'])
      await b.run(file({ ...spec, id, deadlineSeconds: DEADLINE_SECONDS, brief: id }));
    for (const id of ['late', 'finished', 'stuck']) await startedLongAgo(b, id);
    blocked('stuck');
    b.sessions.set(nameFor('finished', 1), { ...b.sessions.get(nameFor('finished', 1))!, state: 'completed', exitCode: 0 });
    finishedBefore = (await b.run(eventsOf('finished'))).length;
    await b.run(tick());
    assert.equal(b.sessions.get(nameFor('fresh', 1))?.state, 'working', 'inside the deadline, it runs');
    assert.equal(b.sessions.get(nameFor('late', 1))?.state, 'canceled', 'past it, the harness was told');
    assert.equal(b.sessions.get(nameFor('stuck', 1))?.state, 'canceled', 'blocked past its deadline, the deadline stops it');
  });

  await s.test('a session that finished before the pass past its deadline read it settles on its end, in that one pass', async () => {
    const events = await b.run(eventsOf('finished'));
    const state = fold('finished', events);
    assert.equal(state.settled, 'succeeded', 'the deadline did not overrule a session that finished');
    assert.deepEqual([state.attempts[0].ended, state.attempts[0].reason, state.attempts[0].exitCode], ['succeeded', 'harness', 0]);
    assert.deepEqual(
      events.slice(finishedBefore).map((e) => e.kind),
      ['ended', 'settled'],
      'its end and its settle, in one pass',
    );
  });

  await s.test(
    'the next pass settles the two stopped failed — not a clean stop — while the one blocked inside its deadline needs a person',
    async () => {
      blocked('waiting');
      await b.run(tick());
      const state = fold('late', await b.run(eventsOf('late')));
      assert.equal(state.settled, 'failed', 'the next pass: the session is not live, so the task settles — failed, not a clean stop');
      assert.equal(await b.run(phaseOf('stuck')), 'failed', 'and the stopped blocked one settles');
      assert.equal(await b.run(phaseOf('waiting')), 'needs-human', 'blocked, and before its deadline nothing ends it');
      assert.equal(b.sessions.get(nameFor('fresh', 1))?.state, 'working', 'and the one inside its deadline still runs');
    },
  );

  await s.test('a pass more: the one inside its deadline still waits', async () => {
    await b.run(tick());
    assert.equal(await b.run(phaseOf('waiting')), 'needs-human');
  });
});

/**
 * A board whose harness fails some spawns, two ways.
 *
 *   brief `refuse`           it says nothing started: `refused`, in the words a CLI would use
 *   brief `start-then-fail`  it registers the session, then fails without saying so — a launcher
 *                            that lost its acknowledgement, the case a spawn error cannot rule out
 */
const refusingBoard = () => {
  const sessions = new Map<string, Sighting>();
  const spawned: SpawnRequest[] = [];
  const ops = testOps({ sessions, spawned });
  const layer = Layer.mergeAll(
    Journal.test(),
    Runner.layer({
      ...ops,
      spawn: (r) =>
        r.brief === 'refuse'
          ? Effect.fail(
              new RunnerError({
                verb: 'spawn',
                message: "claude --bg: error: option '--permission-mode <mode>' argument 'yolo' is invalid.",
                refused: true,
              }),
            )
          : r.brief === 'start-then-fail'
            ? ops
                .spawn(r)
                .pipe(Effect.andThen(Effect.fail(new RunnerError({ verb: 'spawn', message: 'launcher: lost the acknowledgement' }))))
            : ops.spawn(r),
    }),
    tickMemoLayer({ verify: true }),
  );
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  return { sessions, spawned, run };
};

test('the ways an attempt fails: a spawn refused, a harness failure, a session lost, a budget spent — each settles failed, and nothing is started again', async (t) => {
  const s = story(t);
  const b = refusingBoard();
  const spawnsOf = (id: string) => b.spawned.filter((r) => r.name.startsWith(`ae/${id}/`)).map((r) => r.name);

  await s.test(
    'a spawn the harness refuses ends the attempt, unstartable, in its words — and the pass goes on to the task behind it',
    async () => {
      await b.run(file({ ...spec, brief: 'refuse', id: 'a-bad' }));
      await b.run(file({ ...spec, brief: 'refuse', id: 'a-long', restartPolicy: 'Always', config: { background: true } }));
      await b.run(file({ ...spec, id: 'b-good' }));
      await b.run(tick());
      const v = await b.run(view('a-bad', new Map()));
      assert.equal(v.state.settled, 'failed');
      assert.equal(v.state.attempts[0]?.reason, 'unstartable');
      assert.match(v.state.attempts[0]?.error ?? '', /argument 'yolo' is invalid/);
      assert.ok(b.sessions.has(nameFor('b-good', 1)), 'the task behind it started in the same pass');
    },
  );

  await s.test(
    'passes after start neither again: one attempt each, unstartable, settled failed — the long-lived one too, its note naming the fix',
    async () => {
      for (let pass = 0; pass < 2; pass++) await b.run(tick());
      for (const id of ['a-bad', 'a-long']) {
        const v = await b.run(view(id, new Map()));
        assert.deepEqual(
          v.state.attempts.map((a) => a.reason),
          ['unstartable'],
          id,
        );
        assert.equal(v.state.settled, 'failed', id);
        assert.equal(b.sessions.has(nameFor(id, 2)), false, `${id}: no second attempt`);
      }
      const settled = (await b.run(eventsOf('a-long'))).find((e) => e.kind === 'settled');
      const note = settled?.kind === 'settled' ? (settled.note ?? '') : '';
      assert.match(note, /could not start: /);
      assert.match(note, /argument 'yolo' is invalid/, 'in its words');
      assert.match(note, /; fix what it names and file the task again$/);
    },
  );

  await s.test('a session its harness fails settles the task failed: one attempt per start, and no second session', async () => {
    b.sessions.set(nameFor('b-good', 1), { ...b.sessions.get(nameFor('b-good', 1))!, state: 'failed' });
    await b.run(tick());
    await b.run(tick());
    assert.equal(await b.run(phaseOf('b-good')), 'failed');
    assert.deepEqual(spawnsOf('b-good'), [nameFor('b-good', 1)], "trying again is the layer above's: it files the task again");
  });

  await s.test(
    'a session its harness ended at its budget ends failed, as its harness said, with the limit and what it cost on its attempt — and settles failed as any failure does',
    async () => {
      const id = await b.run(file({ ...spec, id: 'c-budget', config: { budgetUsd: 0.01 } }));
      await b.run(tick());
      b.sessions.set(nameFor(id, 1), {
        ...b.sessions.get(nameFor(id, 1))!,
        state: 'failed',
        exitCode: 1,
        limit: 'budget',
        usage: { costUsd: 0.018, apiMs: 718 },
      });
      for (let i = 0; i < 3; i++) await b.run(tick());
      const { state } = await b.run(view(id, new Map()));
      const [a] = state.attempts;
      assert.deepEqual(
        [a.ended, a.reason, a.limit, a.exitCode],
        ['failed', 'harness', 'budget', 1],
        'the limit written beside the end, off the same sighting',
      );
      assert.deepEqual(a.usage, { costUsd: 0.018, apiMs: 718 }, 'and what it spent getting there');
      assert.equal(state.settled, 'failed');
      assert.equal(state.attempts.length, 1, 'a budget spent is spent: no attempt 2');
      assert.deepEqual(spawnsOf(id), [nameFor(id, 1)], 'and nothing spawned for one');
      const settled = (await b.run(eventsOf(id))).find((e) => e.kind === 'settled');
      assert.equal(
        settled?.kind === 'settled' ? settled.note : undefined,
        '1 attempt(s), none succeeded',
        'the runtime says nothing of a budget: the layer above reads the limit',
      );
    },
  );

  await s.test('a LOST attempt settles the task failed, its session on the record for the layer above to continue', async () => {
    const id = await b.run(file({ ...spec, id: 'd-lost' }));
    await b.run(tick());
    const first = nameFor(id, 1);
    const nativeId = b.sessions.get(first)!.nativeId!;
    b.sessions.delete(first);
    await b.run(
      Effect.flatMap(Journal, (j) =>
        j.append(id, {
          kind: 'ended',
          at: new Date().toISOString(),
          attempt: 1,
          sessionId: first,
          observed: 'failed',
          reason: 'lost',
          nativeId,
        }),
      ),
    );
    await b.run(tick());
    const { state } = await b.run(view(id, new Map()));
    assert.equal(
      state.settled,
      'failed',
      'a session gone from the harness, nobody saying how it ended, its end written as the engine writes one past the grace window',
    );
    assert.deepEqual(spawnsOf(id), [first], 'no attempt 2, resumed or clean');
    assert.equal(state.attempts[0].nativeId, nativeId, 'the session a new filing would continue, with `resumeFrom`');
  });

  await s.test(
    'a journal an older runtime wrote with `maxAttempts: 2, resume: always` waits to be admitted, then settles on its first failure all the same',
    async () => {
      const id = 'legacy';
      await b.run(
        Effect.flatMap(Journal, (j) =>
          j.append(id, { kind: 'filed', at: new Date().toISOString(), brief: 'b', cwd: '/r', maxAttempts: 2, resume: 'always' } as Event),
        ),
      );
      await b.run(tick());
      assert.deepEqual(spawnsOf(id), [], 'a journal from before stage 4c waits to be admitted');
      await b.run(admit([id]));
      await b.run(tick());
      b.sessions.set(nameFor(id, 1), { ...b.sessions.get(nameFor(id, 1))!, state: 'failed' });
      await b.run(tick());
      await b.run(tick());
      assert.deepEqual(spawnsOf(id), [nameFor(id, 1)]);
      assert.equal((await b.run(view(id, new Map()))).state.settled, 'failed');
    },
  );
});

test('a long-lived session beside a job: its spend counted as it grows, left open across a daemon restart, its respawn journalled, its death ended on its last reading', async (t) => {
  const s = story(t);
  const r = recording();
  let run = r.daemon();
  const open = 'open';
  const job = 'job';
  const name = nameFor(open, 1);
  const sight = (usage: Sighting['usage'], state: SessionState = 'input-required') => {
    for (const id of [open, job]) r.sessions.set(nameFor(id, 1), { sessionId: `s-${id}`, state, busy: false, held: true, usage });
  };

  await s.test(
    'what the long-lived session consumed is journalled as it grows — once per reading however many passes see it — where the job with the same sightings is journalled none',
    async () => {
      await run(file({ ...spec, id: open, restartPolicy: 'Always', config: { background: true } }));
      await run(file({ ...spec, id: job }));
      await run(tick());
      sight({ turns: 1, outputTokens: 10 });
      await run(tick());
      sight({ turns: 1, outputTokens: 10 });
      await run(tick());
      sight({ turns: 2, outputTokens: 25, costUsd: 0.1 });
      const report = await run(tick());
      const events = await run(eventsOf(open));
      assert.deepEqual(
        events.flatMap((e) => (e.kind === 'counted' ? [e.usage] : [])),
        [
          { turns: 1, outputTokens: 10 },
          { turns: 2, outputTokens: 25 },
        ],
        'two readings, two entries, and no cost among them',
      );
      assert.deepEqual(report.views.find((v) => v.id === open)?.usage, { turns: 2, outputTokens: 25 }, 'the pass reports what it wrote');
      assert.equal((await run(kindsOf(job))).includes('counted'), false, 'a job writes its spend at its end');
    },
  );

  await s.test(
    'RESTART: idle across a daemon restart it is left open — no end recorded, no stop, no release, no second spawn — where the job its harness lists done is ended and released',
    async () => {
      r.sessions.set(nameFor(job, 1), { ...r.sessions.get(nameFor(job, 1))!, state: 'completed' });
      await run(tick());
      run = r.daemon();
      for (let pass = 0; pass < 3; pass++) await run(tick());
      assert.deepEqual(
        await run(kindsOf(open)),
        ['filed', 'starting', 'spawned', 'counted', 'counted'],
        'nothing but its start and spend on the record',
      );
      assert.equal(await run(phaseOf(open)), 'idle');
      assert.equal(r.spawned.length, 2, 'no second session');
      assert.deepEqual(
        r.asked.filter((a) => a.endsWith(` s-${open}`)),
        [],
        'neither stopped nor released',
      );
      assert.deepEqual((await run(kindsOf(job))).slice(0, 4), ['filed', 'starting', 'spawned', 'ended'], 'the job, sighted done, is ended');
      assert.equal(await run(phaseOf(job)), 'succeeded');
      assert.ok(r.asked.includes(`release s-${job}`), 'and its session released');
    },
  );

  await s.test(
    'a respawn its harness makes is journalled — the gap once however many passes see it, the new process that closes it — shown restarting, never acted on, the gap stamped in this boot',
    async () => {
      const listed = r.sessions.get(name)!;
      r.sessions.set(name, { ...listed, held: true, pid: 100 });
      await run(tick());
      r.sessions.set(name, { ...listed, held: false });
      for (let pass = 0; pass < 3; pass++) await run(tick());
      assert.equal(await run(phaseOf(open)), 'restarting');
      r.sessions.set(name, { ...listed, held: true, pid: 200 });
      const report = await run(tick());
      assert.equal(
        report.views.find((v) => v.id === open)?.state.attempts[0].processes?.join(),
        '100,200',
        'the pass reports what it wrote',
      );
      assert.deepEqual(await run(kindsOf(open)), ['filed', 'starting', 'spawned', 'counted', 'counted', 'process', 'gap', 'process']);
      assert.equal(await run(phaseOf(open)), 'idle');
      assert.equal(r.spawned.length, 2, 'nothing spawned beside it');
      const gap = (await run(eventsOf(open))).find((e) => e.kind === 'gap');
      assert.equal(gap?.kind === 'gap' && gap.mono?.boot, monoNow()?.boot, 'the gap is stamped in this boot');
    },
  );

  await s.test(
    "its death is ended with the sighting's reading at its end, on the monotonic clock of this boot after its gap, which the restart measures",
    async () => {
      sight({ turns: 3, outputTokens: 40 }, 'failed');
      await run(tick());
      const events = await run(eventsOf(open));
      const gap = events.find((e) => e.kind === 'gap');
      const end = events.find((e) => e.kind === 'ended');
      assert.ok(gap?.kind === 'gap' && end?.kind === 'ended', 'a gap and an end journalled');
      assert.deepEqual(end.usage, { turns: 3, outputTokens: 40 }, "the end carries the sighting's reading at its end");
      assert.equal(end.mono?.boot, monoNow()?.boot, 'the end is stamped in this boot');
      assert.ok(end.mono!.ms >= gap.mono!.ms, 'and later on that clock');
    },
  );
});

test('long-lived: what a daemon reads off the record of a long-lived task — when it began, a gap gone long, an end past its backoff', async (t) => {
  await t.test(
    "a long-lived attempt is looked for with when the journal says it began, which its runner counts its spend from; a job's is not",
    async () => {
      const journal = Journal.test();
      const sessions = new Map<string, Sighting>();
      const asked: ExpectedSession[][] = [];
      const runner = Runner.layer({
        ...testOps({ sessions }),
        observeFor: (expected) =>
          Effect.sync(() => {
            asked.push([...expected]);
            return { seen: new Map(sessions), unread: new Set<string>() };
          }),
      });
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) =>
        Effect.runPromise(e.pipe(Effect.provide(Layer.mergeAll(journal, runner, tickMemoLayer({ verify: true })))));
      const open = await run(file({ ...spec, id: 'open', restartPolicy: 'Always', config: { background: true } }));
      const job = await run(file({ ...spec, id: 'job' }));
      await run(tick());
      await run(tick());
      const startedAt = async (id: string) => (await run(eventsOf(id))).find((e) => e.kind === 'starting')!.at;
      assert.deepEqual(
        new Map(asked.at(-1)?.map((e) => [e.name, e])),
        new Map([
          [nameFor(open, 1), { name: nameFor(open, 1), harness: undefined, since: Date.parse(await startedAt(open)) }],
          [nameFor(job, 1), { name: nameFor(job, 1), harness: undefined }],
        ]),
      );
    },
  );

  await t.test(
    'a settled long-lived task the memo keeps, its session still listed, is looked for with when its attempt began — so its release counts from then',
    async () => {
      const journal = Journal.test();
      const sessions = new Map<string, Sighting>();
      const asked: ExpectedSession[][] = [];
      const runner = Runner.layer({
        ...testOps({ sessions }),
        observeFor: (expected) =>
          Effect.sync(() => {
            asked.push([...expected]);
            return { seen: new Map(sessions), unread: new Set<string>() };
          }),
        release: () => Effect.fail(new RunnerError({ verb: 'release', message: 'claude rm: still running' })),
      });
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) =>
        Effect.runPromise(e.pipe(Effect.provide(Layer.mergeAll(journal, runner))));
      const memo = tickMemoLayer({ verify: true });
      const pass = () => Effect.runPromise(tick().pipe(Effect.provide(Layer.mergeAll(journal, runner, memo))));
      const open = await run(file({ ...spec, id: 'open', restartPolicy: 'Always', config: { background: true } }));
      await pass();
      await run(requestStop(open));
      await pass();
      await pass();
      await pass();
      const events = await run(eventsOf(open));
      assert.ok(
        events.some((e) => e.kind === 'settled'),
        'settled, and its release refused: the memo keeps it as still listed',
      );
      const since = Date.parse(events.find((e) => e.kind === 'starting')!.at);
      const before = asked.length;
      await pass();
      assert.equal(asked.length, before + 1);
      assert.deepEqual(
        asked.at(-1)?.find((e) => e.name === nameFor(open, 1)),
        { name: nameFor(open, 1), harness: undefined, since },
        "the memo's record keeps the policy and the start the look is told",
      );
    },
  );

  await t.test(
    'a gap open past RESPAWN_GAP_MS on the record is ended lost by a fresh daemon, and its listed session released',
    async () => {
      const r = recording();
      const run = r.daemon();
      const id = await run(file({ ...spec, restartPolicy: 'Always', config: { background: true } }));
      await run(
        journalAgo(
          id,
          [300_000, { kind: 'starting', attempt: 1 }],
          [300_000, { kind: 'spawned', attempt: 1 }],
          [300_000, { kind: 'process', attempt: 1, pid: 100 }],
          [121_000, { kind: 'gap', attempt: 1 }],
        ),
      );
      r.sessions.set(nameFor(id, 1), { sessionId: 'native-1', state: 'input-required', busy: false, held: false, nativeId: 'native-1' });
      await r.daemon()(tick());
      const end = (await run(eventsOf(id))).find((e) => e.kind === 'ended');
      assert.deepEqual(end && [end.attempt, end.observed, end.reason, end.nativeId], [1, 'failed', 'lost', 'native-1']);
      assert.ok(r.asked.includes('release native-1'), 'the old session let go in the pass that ended it');
      assert.equal(r.spawned.length, 0, 'nothing restarted inside the backoff');
    },
  );

  await t.test(
    'a session ended with no stop asked is restarted once the backoff is spent — its old session stopped first, the new one resuming its conversation, told RESTART_WORDS',
    async () => {
      const r = recording();
      const run = r.daemon();
      const id = await run(file({ ...spec, restartPolicy: 'Always', config: { background: true } }));
      await run(
        journalAgo(
          id,
          [300_000, { kind: 'starting', attempt: 1 }],
          [300_000, { kind: 'spawned', attempt: 1 }],
          [11_000, { kind: 'ended', attempt: 1, sessionId: 'native-1', observed: 'failed', reason: 'lost', nativeId: 'native-1' }],
        ),
      );
      r.sessions.set(nameFor(id, 1), { sessionId: 'native-1', state: 'input-required', busy: false, held: false, nativeId: 'native-1' });
      await r.daemon()(tick());
      assert.deepEqual(r.asked.slice(0, 1), ['stop native-1'], 'still listed live: stopped before anything starts');
      assert.equal(r.spawned.length, 0);
      await r.daemon()(tick());
      assert.deepEqual(
        r.spawned.map((s) => [s.name, s.resumeFrom, s.brief]),
        [[nameFor(id, 2), 'native-1', RESTART_WORDS]],
      );
      assert.deepEqual((await run(kindsOf(id))).slice(-2), ['starting', 'spawned']);
    },
  );
});

test('the closing statement as the engine judges it: own, inherited, unstamped, busy, blocked, after its end, or none asked', async (t) => {
  await t.test('a statement made during the attempt ends it, whatever the harness still says', async () => {
    const b = board();
    const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, { ...b.sessions.get(name)!, busy: false, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });
    await b.run(tick());
    const v = await b.run(view(id, new Map()));
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' }, 'and what it said is on the record');
  });

  await t.test('a statement made BEFORE the attempt began was inherited, not said', async () => {
    const b = board();
    const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, { ...b.sessions.get(name)!, busy: false, closeout: { payload: { outcome: 'done', by: 'parent' }, at: 0 } });
    await b.run(tick());
    assert.equal((await b.run(view(id, new Map()))).state.settled, null, 'the parent finishing is not the child finishing');

    b.sessions.set(name, { ...b.sessions.get(name)!, state: 'completed' });
    await b.run(tick());
    const v = await b.run(view(id, new Map()));
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(
      v.state.attempts.map((a) => [a.ended, a.reason, a.closeout, a.stated]),
      [['succeeded', 'harness', undefined, false]],
      'ended by its harness, the inherited statement is not written down as its own, and having said nothing of its own it is recorded `stated: false`, which the layer above reads as unsigned',
    );
  });

  await t.test('a statement with no time is the session’s own: it ends the attempt and is on the record', async () => {
    const b = board();
    const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, { ...b.sessions.get(name)!, busy: false, closeout: { payload: { outcome: 'done', by: 'child' } } });
    await b.run(tick());
    const v = await b.run(view(id, new Map()));
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(
      v.state.attempts.map((a) => [a.ended, a.closeout, a.stated]),
      [['succeeded', { outcome: 'done', by: 'child' }, true]],
      'no time to judge it by, and none needed: a runner gives none only for a session that cannot carry another attempt’s statement',
    );
  });

  await t.test('a statement from a session that is still busy is not final', async () => {
    const b = board();
    const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, { ...b.sessions.get(name)!, busy: true, closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });
    await b.run(tick());
    assert.equal((await b.run(view(id, new Map()))).state.settled, null, 'still typing');
    b.sessions.set(name, { ...b.sessions.get(name)!, busy: false });
    await b.run(tick());
    assert.equal((await b.run(view(id, new Map()))).state.settled, 'succeeded', 'idle, its statement is final');
  });

  await t.test('a statement ends the attempt when the harness has marked the session blocked, as when working', async () => {
    const b = board();
    const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, {
      ...b.sessions.get(name)!,
      state: 'input-required',
      busy: false,
      closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 },
    });
    const action = await b.run(reconcile(id, new Map(b.sessions)));
    assert.ok(action.do === 'record-end', `the attempt ends, not "${action.do === 'nothing' ? action.why : action.do}"`);
    assert.equal(action.observed, 'succeeded');
    assert.deepEqual(action.closeout, { outcome: 'done' }, 'with what it said on the end');
    await b.run(tick());
    const v = await b.run(view(id, new Map(b.sessions)));
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' });
  });

  await t.test('a blocked session with no statement is surfaced as needing a person, not as progress', async () => {
    const b = board();
    const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, { ...b.sessions.get(name)!, state: 'input-required', busy: false });
    assert.deepEqual(await b.run(reconcile(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
    await b.run(tick());
    assert.equal(await b.run(phaseOf(id)), 'needs-human');

    const plain = board();
    const other = await plain.run(file(spec));
    await plain.run(tick());
    for (const [k, v] of plain.sessions) plain.sessions.set(k, { ...v, state: 'input-required' });
    await plain.run(tick());
    assert.equal(await plain.run(phaseOf(other)), 'needs-human', 'and so is one whose task asked for none');
  });

  await t.test('blocked with an inherited statement still needs a person, and the statement is not recorded', async () => {
    const b = board();
    const { id, name } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, {
      ...b.sessions.get(name)!,
      state: 'input-required',
      busy: false,
      closeout: { payload: { outcome: 'done', by: 'parent' }, at: 0 },
    });
    assert.deepEqual(await b.run(reconcile(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
    await b.run(tick());
    assert.equal(await b.run(phaseOf(id)), 'needs-human');

    b.sessions.set(name, { ...b.sessions.get(name)!, state: 'completed' });
    const action = await b.run(reconcile(id, new Map(b.sessions)));
    assert.ok(action.do === 'record-end');
    assert.equal(action.closeout, undefined, "ended by its harness, the parent's statement is not written down as this attempt's");
    assert.equal(action.stated, false, 'nothing of its own was said');
    await b.run(tick());
    const v = await b.run(view(id, new Map()));
    assert.equal(v.state.attempts[0]?.closeout, undefined);
    assert.equal(v.state.attempts[0]?.stated, false);
  });

  await t.test('blocked and busy: a statement it may yet revise still waits', async () => {
    const b = board();
    const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, {
      ...b.sessions.get(name)!,
      state: 'input-required',
      busy: true,
      closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 },
    });
    assert.deepEqual(await b.run(reconcile(id, new Map(b.sessions))), { do: 'nothing', why: 'blocked — needs a person' });
    assert.equal((await b.run(view(id, new Map()))).state.settled, null);
  });

  await t.test('a session the harness already ended keeps its statement on the record — unread', async () => {
    const b = board();
    const { id, name, startedAt } = await running(b, { ...spec, closeoutSchema: SCHEMA });
    b.sessions.set(name, {
      ...b.sessions.get(name)!,
      state: 'completed',
      closeout: { payload: { outcome: 'blocked' }, at: startedAt + 1000 },
    });
    await b.run(tick());
    const v = await b.run(view(id, new Map()));
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(
      v.state.attempts[0]?.closeout,
      { outcome: 'blocked' },
      '`blocked` means something to whoever filed the task: to the engine it is a payload',
    );
  });

  await t.test('no schema, no statement: a task ends exactly as it did before', async () => {
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
});

test("the pass's refusals: an argument a pass, a step or a settle was never built to take, and options `ae` cannot build an engine from — each refused by kind, nothing read or journalled", async (t) => {
  await t.test(
    'the pass refuses any argument — an old ceiling, pools, anything, from a caller untyped as one built against the old door — and reads nothing',
    async () => {
      const b = board();
      await b.run(file(spec));
      const untyped: (...a: unknown[]) => ReturnType<typeof tick> = tick;
      for (const args of [[3], [3, { claude: 'claude' }], [undefined]] as const) {
        const refused = await b.run(Effect.flip(untyped(...args)));
        assert.equal(refused._tag, 'TickRefused');
        assert.match(refused.message, new RegExp(`^the pass takes no arguments, and was handed ${args.length}:`));
        assert.match(refused.message, /give `Engine\.layer` a `maxConcurrent`/, 'naming where a ceiling goes');
      }
      assert.equal(b.sessions.size, 0, 'nothing started by a refused pass');
    },
  );

  await t.test(
    "reconcile and settleTask refuse the ceiling's old slots — neither drops them, nor settles nothing on them — and journal nothing",
    async () => {
      const b = board();
      const id = await b.run(file(spec));
      const journalOf = async () => (await b.run(view(id, new Map()))).state.attempts.length;
      const oldReconcile = reconcile as (...a: unknown[]) => ReturnType<typeof reconcile>;
      for (const extra of [[{ used: 0, max: 3 }], [undefined], [{ used: 0, max: 3 }, 8]]) {
        const refused = await b.run(Effect.flip(oldReconcile(id, new Map(), ...extra)));
        assert.equal(refused._tag, 'ReconcileRefused');
        assert.match(refused.message, new RegExp(`^reconcile takes a task .* handed ${extra.length} more`));
        assert.match(refused.message, /`maxConcurrent`/);
      }
      const oldSettle = settleTask as (...a: unknown[]) => ReturnType<typeof settleTask>;
      for (const args of [[{ used: 0, max: 3 }], [{ used: 0, max: 3 }, 8], [0], [-1], [1.5], [Number.NaN], ['8'], [null], [8, 'more']]) {
        const refused = await b.run(Effect.flip(oldSettle(id, new Map(), ...args)));
        assert.equal(refused._tag, 'ReconcileRefused', `settleTask(id, observed, ${String(args)})`);
        assert.match(refused.message, /^settleTask takes a task, an observation and/);
        assert.match(refused.message, /`maxConcurrent`/);
      }
      assert.equal(await journalOf(), 0, 'no attempt journalled by a refused step');
      assert.equal(b.sessions.size, 0, 'and nothing started');
      assert.equal((await b.run(settleTask(id, new Map(), 1))).length, 1, 'the door as it is: a count settles');
      assert.ok((await b.run(settleTask(id, new Map()))).length >= 1, "and settleTask's own default does");
    },
  );

  await t.test('an engine `ae` cannot build from its options is refused with exit code 2, its message led by `ae`', async () => {
    const err = await engineAt({ root: scratch('ae-engine-at-'), maxConcurrent: 0 }).then(
      () => assert.fail('the options were built into an engine'),
      (e: unknown) => e as Error & { exitCode?: number },
    );
    assert.equal(err.exitCode, 2);
    assert.ok(err.message.startsWith('ae: '), err.message);
    assert.match(err.message, /`maxConcurrent: 0` is not a ceiling/);
  });
});

test("decide never reads tools, effort, MCP servers, a budget, a context window, Remote Control, a priority an old journal carries, a filing time, labels, a trace context, usage, a cost, an exit code, what a person said, or an end time but for a long-lived task's backoff — carried on the record, never judged", () => {
  const source = fs.readFileSync(new URL('../src/core/domain.ts', import.meta.url), 'utf8');
  const from = source.indexOf('export function decide(');
  assert.ok(from >= 0, 'found decide');
  const body = source.slice(from);
  for (const name of [
    'export function lifecycleOf(',
    'export function observe(',
    'export function spawnRefused(',
    'export function needsHuman(',
    'export const idleOf =',
    'export function backoffOf(',
  ])
    assert.ok(body.includes(name), `the slice holds ${name}`);
  const endTime = /const endedWhen = \([^)]*\)[^=]*=>\s*[^;]*\.endedAt[^;]*;/;
  assert.match(body, endTime, 'the one reading of an end time, `endedWhen`, the backoff reads');
  const machine = fs.readFileSync(new URL('../src/core/lifecycle.ts', import.meta.url), 'utf8');
  for (const read of [body.replace(endTime, ''), machine])
    assert.doesNotMatch(
      read,
      /\.tools|\.disallowedTools|\.effort|\.mcp\b|\.usage|\.exitCode|\.endedAt|\.said|\.budgetUsd|\.contextTokens|\.costUsd|\.remoteControl|\.claude\b|\.priority|\.filedAt|\.labels|\.traceparent/,
    );
});

test('LIVE is exactly the states decide waits on — `busy` is not a state, so it is not one of them', () => {
  const STATES: Record<SessionState, true> = {
    submitted: true,
    working: true,
    'input-required': true,
    'auth-required': true,
    completed: true,
    failed: true,
    canceled: true,
    rejected: true,
  };
  const t0 = new Date(0).toISOString();
  const inFlight = fold('t', [
    { kind: 'filed', at: t0, brief: 'b', cwd: '/r' },
    { kind: 'starting', at: t0, attempt: 1 },
    { kind: 'spawned', at: t0, attempt: 1 },
  ]);
  const waitsOn = (Object.keys(STATES) as SessionState[]).filter(
    (state) =>
      decide(inFlight, new Map([[nameFor('t', 1), { sessionId: 's', state }]]), { at: new Date(0), graceMs: GRACE_MS }).do === 'nothing',
  );
  assert.deepEqual(
    [...LIVE].sort(),
    waitsOn.sort(),
    'every `SessionState`, by type: a state added to it and not to STATES does not compile',
  );
  assert.equal((LIVE as ReadonlySet<string>).has('busy'), false);
});

test("a move the lifecycle has no edge for is on every pass's report while it lasts, and off it once the task moves on", async () => {
  const b = board();
  const id = await b.run(file({ ...spec, id: 'held' }));
  const other = await b.run(file({ ...spec, id: 'moving' }));
  const planted = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) =>
    b.run(Effect.provideService(e, Lifecycle, withoutEdge('working', 'SESSION_LIVE')));
  const first = await planted(tick());
  assert.deepEqual(first.refused, [], 'submitted → starting → working is not the missing edge');
  for (let pass = 0; pass < 3; pass++) {
    const report = await planted(tick());
    assert.deepEqual(
      report.refused,
      [
        { taskId: id, state: 'working', event: 'SESSION_LIVE' },
        { taskId: other, state: 'working', event: 'SESSION_LIVE' },
      ],
      `pass ${pass}`,
    );
    assert.equal(await b.run(phaseOf(id)), 'working', 'and nothing was done to it');
  }
  b.sessions.set(nameFor(other, 1), { ...b.sessions.get(nameFor(other, 1))!, state: 'completed' });
  const report = await planted(tick());
  assert.deepEqual(
    report.refused,
    [{ taskId: id, state: 'working', event: 'SESSION_LIVE' }],
    'an ended session has its edge, and leaves the report',
  );
  assert.equal(await b.run(phaseOf(other)), 'succeeded');
  assert.deepEqual((await b.run(tick())).refused, [], 'the shipped machine refuses nothing');
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
    append: (taskId, event) =>
      Effect.sync(() => {
        store.set(taskId, [...(store.get(taskId) ?? []), event]);
        feed.push({ taskId, event });
      }),
    read: (taskId) =>
      Effect.sync(() => {
        reads.set(taskId, (reads.get(taskId) ?? 0) + 1);
        return [...(store.get(taskId) ?? [])];
      }),
    list: Effect.sync(() => [...store.keys()].sort()),
    feed: (after) => Effect.sync(() => ({ entries: feed.slice(after), cursor: feed.length })),
  };
  return {
    layer: Journal.layer(ops),
    readsOf: (id: string) => reads.get(id) ?? 0,
    pastTheFeed: (id: string, event: Event) => {
      store.set(id, [...(store.get(id) ?? []), event]);
    },
  };
};

/**
 * `done` settled `succeeded` and `live` at work, on a board of that journal, and a pass after the settling's, which folds
 * `done` again since the feed names the settling: after it, nothing has.
 */
const settledBeside = async (j: ReturnType<typeof countedJournal>, memo: { verify: boolean } | false) => {
  const b = board(j.layer, memo);
  for (const id of ['done', 'live']) await b.run(file({ ...spec, id }));
  await b.run(tick());
  b.sessions.set(nameFor('done', 1), { ...b.sessions.get(nameFor('done', 1))!, state: 'completed' });
  await b.run(tick());
  assert.equal(await b.run(phaseOf('done')), 'succeeded');
  await b.run(tick());
  return b;
};

test('the memo: a pass skips a settled task until the feed names it — check mode proves each skip, and the Effect door with none folds every task', async (t) => {
  await t.test('a pass skips a settled task nothing has written to since it was folded, and folds every task not settled', async () => {
    const j = countedJournal();
    const b = await settledBeside(j, { verify: false });
    const done = j.readsOf('done');
    const live = j.readsOf('live');
    for (let pass = 0; pass < 3; pass++) await b.run(tick());
    assert.equal(j.readsOf('done'), done, 'the settled task was not read again');
    assert.equal(j.readsOf('live'), live + 3 * 2, 'the task at work is folded on every pass, and read again by its step');
  });

  await t.test(
    'an entry appended to a settled task, through the feed, has the next pass fold it again — and the pass after skip it',
    async () => {
      const j = countedJournal();
      const b = await settledBeside(j, { verify: true });
      const before = j.readsOf('done');
      await b.run(
        Effect.flatMap(Journal, (journal) =>
          journal.append('done', { kind: 'measured', at: new Date().toISOString(), attempt: 1, usage: { costUsd: 1 } }),
        ),
      );
      await b.run(tick());
      assert.equal(j.readsOf('done'), before + 2, 'folded again, and stepped: its decision is nothing');
      await b.run(tick());
      assert.equal(j.readsOf('done'), before + 2 + 1, 'in check mode, a skip is folded once more, to prove it');
    },
  );

  await t.test(
    'REFUSED in check mode: a pass that would skip a settled task whose journal changed past the feed fails, naming it',
    async () => {
      const j = countedJournal();
      const b = await settledBeside(j, { verify: true });
      j.pastTheFeed('done', { kind: 'measured', at: new Date().toISOString(), attempt: 1, usage: { costUsd: 1 } });
      await assert.rejects(
        b.run(tick()),
        (e: Error & { _tag?: string; taskId?: string }) =>
          e._tag === 'TickMemoDiverged' && e.taskId === 'done' && /the feed did not say so/.test(e.message),
      );
    },
  );

  await t.test('the same change past the feed, without check mode, is skipped: the proof above is what would catch it', async () => {
    const j = countedJournal();
    const b = await settledBeside(j, { verify: false });
    const before = j.readsOf('done');
    j.pastTheFeed('done', { kind: 'measured', at: new Date().toISOString(), attempt: 1, usage: { costUsd: 1 } });
    await b.run(tick());
    assert.equal(j.readsOf('done'), before, 'not read: the memo trusts the feed');
  });

  await t.test('a pass with no memo — the Effect door, on layers of its own — folds every task on every pass', async () => {
    const j = countedJournal();
    const b = await settledBeside(j, false);
    const before = j.readsOf('done');
    await b.run(tick());
    assert.equal(j.readsOf('done'), before + 2, 'folded, and read again by its step');
  });
});

test('the release: a finished session is let go and looked for no more, what it consumed written once — a refused release asked again while it is listed', async (t) => {
  await t.test(
    'what a release reads once it has stopped a session is written on the attempt once, as measured — a session left listed is asked on every pass',
    async () => {
      const sessions = new Map<string, Sighting>();
      const ops = testOps({ sessions });
      let asked = 0;
      const layer = Layer.mergeAll(
        Journal.test(),
        Runner.layer({
          ...ops,
          /**
           * Stops the session on the first call, as Claude Code writes a session's cost only then; it stays listed, as a worktree
           * task's does.
           */
          release: () => Effect.sync(() => (++asked === 1 ? { turns: 2, costUsd: 0.5, apiMs: 900 } : undefined)),
        }),
      );
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const id = await run(file(spec));
      await run(tick());
      for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'completed', usage: { turns: 2 } });
      for (let i = 0; i < 3; i++) await run(tick());

      assert.equal(asked, 3, 'released on every pass that still sees it');
      const events = await run(eventsOf(id));
      const ended = events.find((e) => e.kind === 'ended');
      assert.deepEqual(ended?.kind === 'ended' && ended.usage, { turns: 2 }, 'its end, as the sighting that ended it said');
      assert.deepEqual(
        events.filter((e) => e.kind === 'measured').map((e) => e.kind === 'measured' && e.usage),
        [{ turns: 2, costUsd: 0.5, apiMs: 900 }],
        'written once',
      );
      assert.deepEqual(fold(id, events).attempts[0].usage, { turns: 2, costUsd: 0.5, apiMs: 900 });
    },
  );

  await t.test(
    'a settled task let go of is released off what the memo kept, looked for no more though its harness still lists it ended, and what it consumed is written once, through the feed',
    async () => {
      const j = countedJournal();
      const sessions = new Map<string, Sighting>();
      const released: string[] = [];
      const told: string[][] = [];
      const ops = testOps({ sessions });
      const runner = Runner.layer({
        ...ops,
        observeFor: (expected) =>
          Effect.sync(() => {
            told.push(expected.map((e) => e.name));
            return { seen: new Map([...sessions].filter(([name]) => expected.some((e) => e.name === name))), unread: new Set<string>() };
          }),
        /** Says what the session consumed only once it has let it go, and keeps it listed after, as a detached run's file is. */
        release: (s) =>
          Effect.sync(() => {
            released.push(s.sessionId);
            return { costUsd: 0.5 };
          }),
      });
      const layer = Layer.mergeAll(j.layer, runner, tickMemoLayer({ verify: true }));
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      await run(file({ ...spec, id: 'done' }));
      await run(tick());
      sessions.set(nameFor('done', 1), { ...sessions.get(nameFor('done', 1))!, state: 'completed' });
      for (let pass = 0; pass < 4; pass++) await run(tick());
      const events = await run(eventsOf('done'));
      assert.equal(events.filter((e) => e.kind === 'measured').length, 1, 'measured once');
      assert.equal(released.length, 2, 'let go on the pass that ended it, and on the next, which folds it again for its measure');
      assert.equal(sessions.has(nameFor('done', 1)), true, 'though its harness still lists it');
      assert.deepEqual(
        told.slice(1).map((names) => names.includes(nameFor('done', 1))),
        [true, true, false, false],
        'looked for on the pass that ended it and the one that folded its measure, and no more',
      );
    },
  );

  await t.test(
    'a finished session its harness still lists at work is looked for and released on every pass until it has ended, and what it consumed then is written once',
    async () => {
      const sessions = new Map<string, Sighting>();
      const released: number[] = [];
      const told: string[][] = [];
      let pass = 0;
      const ops = testOps({ sessions });
      const runner = Runner.layer({
        ...ops,
        observeFor: (expected) =>
          Effect.sync(() => {
            told.push(expected.map((e) => e.name));
            return { seen: new Map([...sessions].filter(([name]) => expected.some((e) => e.name === name))), unread: new Set<string>() };
          }),
        /** Lets nothing go, as a job's release does: its process runs on until it exits, and writes its cost then. */
        release: () => Effect.sync(() => void released.push(pass)),
      });
      const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const id = await run(file(spec));
      await run(tick());
      const name = nameFor(id, 1);
      sessions.set(name, { ...sessions.get(name)!, state: 'working', busy: false, quietMs: 120_000 });
      for (pass = 1; pass <= 3; pass++) await run(tick());
      assert.equal((await run(view(id, new Map()))).state.settled, 'succeeded', 'ended quiet while its process still runs');
      sessions.set(name, { ...sessions.get(name)!, state: 'completed', quietMs: undefined, usage: { costUsd: 0.25 } });
      for (pass = 4; pass <= 6; pass++) await run(tick());
      const events = await run(eventsOf(id));
      assert.deepEqual(
        events.filter((e) => e.kind === 'measured').map((e) => e.kind === 'measured' && e.usage),
        [{ costUsd: 0.25 }],
        'measured once it ended',
      );
      assert.deepEqual(released, [1, 2, 3, 4, 5], 'released on each pass it was at work, the pass it was seen ended, and the next');
      assert.deepEqual(
        told.slice(1).map((names) => names.includes(name)),
        [true, true, true, true, true, false],
        'looked for while at work, on the pass it was seen ended and the one that folded its measure, and no more',
      );
    },
  );

  await t.test(
    'a pass tells its runner the sessions it expects — every attempt of every task it folds, on its harness — and asks observe nothing when it can be told',
    async () => {
      const sessions = new Map<string, Sighting>();
      const told: string[][] = [];
      let observes = 0;
      const ops = testOps({ sessions });
      const runner = Runner.layer({
        ...ops,
        observe: Effect.suspend(() => {
          observes++;
          return ops.observe;
        }),
        observeFor: (expected) =>
          Effect.suspend(() => {
            told.push(expected.map((e) => `${e.name}@${e.harness ?? '-'}`));
            return ops.observe.pipe(Effect.map((seen) => ({ seen, unread: new Set<string>() })));
          }),
      });
      const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      await run(file({ ...spec, id: 'a', harness: 'claude' }));
      await run(file({ ...spec, id: 'b', harness: 'codex' }));
      await run(tick());
      await run(tick());
      sessions.set(nameFor('a', 1), { ...sessions.get(nameFor('a', 1))!, state: 'completed' });
      for (let pass = 0; pass < 3; pass++) await run(tick());
      assert.deepEqual(
        told,
        [[], ['ae/a/1@claude', 'ae/b/1@codex'], ['ae/a/1@claude', 'ae/b/1@codex'], ['ae/a/1@claude', 'ae/b/1@codex'], ['ae/b/1@codex']],
        'nothing before a spawn; both while they run; `a` while it is folded, and not once the memo keeps it',
      );
      assert.equal(observes, 0, 'observe, told nothing, is never asked when the runner can be told');
    },
  );

  await t.test(
    'a release the harness refuses is asked again on every pass while the harness lists the session, the task kept by the memo, and looked for no more once one goes through',
    async () => {
      const sessions = new Map<string, Sighting>();
      const told: string[][] = [];
      const asked: number[] = [];
      let refusals = 3;
      let pass = 0;
      const ops = testOps({ sessions });
      const runner = Runner.layer({
        ...ops,
        /** Lists only what it is told to look for, as Claude Code does for a background session. */
        observeFor: (expected) =>
          Effect.sync(() => {
            told.push(expected.map((e) => e.name));
            return { seen: new Map([...sessions].filter(([name]) => expected.some((e) => e.name === name))), unread: new Set<string>() };
          }),
        /** Refused `refusals` times, then lets the session go by removing it, as Claude Code does. */
        release: (s) =>
          Effect.suspend(() => {
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
      assert.deepEqual(asked, [1, 2, 3, 4], 'asked on every pass that listed it, the passes the memo kept the task included');
      assert.deepEqual(
        told.slice(1).map((names) => names.includes(name)),
        [true, true, true, true, false, false, false],
        'looked for while its release was refused, and no more once one went through',
      );
    },
  );

  await t.test(
    "a pass's views are what `view` reads after it: an attempt's measure, written by this pass's release, is on the view it reports",
    async () => {
      const sessions = new Map<string, Sighting>();
      const layer = Layer.mergeAll(
        Journal.test(),
        Runner.layer({ ...testOps({ sessions }), release: () => Effect.succeed({ costUsd: 0.5 }) }),
        tickMemoLayer({ verify: true }),
      );
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const id = await run(file({ ...spec, holdOpen: true, closeoutSchema: SCHEMA }));
      await run(tick());
      const name = nameFor(id, 1);
      const startedAt = Date.parse((await run(view(id, new Map()))).state.attempts[0].startedAt);
      sessions.set(name, { ...sessions.get(name)!, state: 'completed', closeout: { payload: { outcome: 'done' }, at: startedAt + 1000 } });
      const report = await run(tick());
      const reported = report.views.find((v) => v.id === id);
      assert.equal(reported?.phase, 'input-required', 'held open: unsettled, so on the report');
      assert.equal(reported?.state.attempts[0]?.usage?.costUsd, 0.5, 'with what the release measured on this pass');
      assert.deepEqual(reported, await run(view(id, new Map(sessions))));
    },
  );
});

/**
 * A harness behind the composite, as `Engine.layer` puts every harness, whose reads fail on the passes a test chooses: the
 * failure the composite answers for, as a `claude agents` timing out is. Lists only what it is told to look for. A read that
 * fails fails whole, as a registry that timed out does, and the composite says the names it was to find unread.
 */
const flakyHarness = (sessions: Map<string, Sighting>, readFails: () => boolean) => {
  const ops = testOps({ sessions });
  const read = (expected?: readonly { name: string }[]) =>
    Effect.suspend(() =>
      readFails()
        ? Effect.fail(new RunnerError({ verb: 'observe', message: 'claude agents: timed out' }))
        : Effect.succeed(new Map([...sessions].filter(([name]) => !expected || expected.some((e) => e.name === name)))),
    );
  return {
    ...ops,
    observe: read(),
    observeFor: (expected: readonly { name: string }[]) => read(expected).pipe(Effect.map((seen) => ({ seen, unread: new Set<string>() }))),
  };
};

test('a harness unread for a pass: neither there nor gone — nothing ended, spawned or released on its names, the next good read followed, and the failure on that pass alone', async (t) => {
  await t.test(
    'a release refused, then one pass that could not read the harness: the release is asked again on the next good pass, since a failed read is not the session gone',
    async () => {
      const sessions = new Map<string, Sighting>();
      const asked: number[] = [];
      let refusals = 3;
      let pass = 0;
      const runner = Runner.layer(
        composite(
          {
            claude: {
              ...flakyHarness(sessions, () => pass === 4),
              release: (s) =>
                Effect.suspend(() => {
                  asked.push(pass);
                  if (refusals-- > 0) return Effect.fail(new RunnerError({ verb: 'release', message: 'claude rm: registry busy' }));
                  for (const [name, listed] of sessions) if (listed.sessionId === s.sessionId) sessions.delete(name);
                  return Effect.succeed(undefined);
                }),
            },
          },
          'claude',
        ),
      );
      const layer = Layer.mergeAll(Journal.test(), runner, tickMemoLayer({ verify: true }));
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const id = await run(file({ ...spec, harness: 'claude' }));
      await run(tick());
      const name = nameFor(id, 1);
      sessions.set(name, { ...sessions.get(name)!, state: 'completed' });
      for (pass = 1; pass <= 6; pass++) await run(tick());
      assert.equal((await run(view(id, new Map()))).state.settled, 'succeeded');
      assert.deepEqual(asked, [1, 2, 3, 5], 'the pass that could not read asked nothing, and the next good one asked again');
      assert.equal(sessions.has(name), false, 'and the session was let go');
    },
  );

  await t.test(
    'a pass that could not read the harness does not end an attempt `lost`, its grace long past: the next good read follows it',
    async () => {
      const sessions = new Map<string, Sighting>();
      let failing = true;
      const layer = Layer.mergeAll(
        Journal.test(),
        Runner.layer(composite({ claude: flakyHarness(sessions, () => failing) }, 'claude')),
        tickMemoLayer({ verify: true }),
      );
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const id = await run(file({ ...spec, harness: 'claude' }));
      const long = new Date(Date.now() - GRACE_MS - 10 * 60_000).toISOString();
      await run(
        Effect.flatMap(Journal, (j) =>
          Effect.all([j.append(id, { kind: 'starting', at: long, attempt: 1 }), j.append(id, { kind: 'spawned', at: long, attempt: 1 })], {
            discard: true,
          }),
        ),
      );
      sessions.set(nameFor(id, 1), { sessionId: 'kept', state: 'working', nativeId: 'kept' });
      await run(tick());
      const events = await run(eventsOf(id));
      assert.equal(
        events.some((e) => e.kind === 'ended' || e.kind === 'settled'),
        false,
        'nothing ended on a read that failed',
      );
      failing = false;
      await run(tick());
      const v = await run(view(id, new Map(sessions)));
      assert.equal(v.state.attempts[0].ended, null);
      assert.equal(v.phase, 'working', 'followed as it runs');
    },
  );

  await t.test(
    'a pass that could not read the harness does not spawn again an intent a crash left with no spawn on the record: the next good read adopts the session',
    async () => {
      const sessions = new Map<string, Sighting>();
      const spawns: string[] = [];
      let failing = true;
      const flaky = flakyHarness(sessions, () => failing);
      const claude = {
        ...flaky,
        spawn: (r: Parameters<typeof flaky.spawn>[0]) =>
          Effect.suspend(() => {
            spawns.push(r.name);
            return flaky.spawn(r);
          }),
      };
      const layer = Layer.mergeAll(Journal.test(), Runner.layer(composite({ claude }, 'claude')), tickMemoLayer({ verify: true }));
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const id = await run(file({ ...spec, harness: 'claude' }));
      await run(Effect.flatMap(Journal, (j) => j.append(id, { kind: 'starting', at: new Date().toISOString(), attempt: 1 })));
      sessions.set(nameFor(id, 1), { sessionId: 'kept', state: 'working', nativeId: 'kept' });
      await run(tick());
      assert.deepEqual(spawns, [], 'not spawned a second time under its name on a read that failed');
      const events = await run(eventsOf(id));
      assert.equal(
        events.some((e) => e.kind === 'ended' || e.kind === 'settled'),
        false,
        'nor ended',
      );
      failing = false;
      await run(tick());
      assert.deepEqual(spawns, [], 'the next good read finds the session under the name');
      const v = await run(view(id, new Map(sessions)));
      assert.equal(v.state.attempts[0].ended, null);
      assert.equal(v.phase, 'working', 'adopted, and followed as it runs');
    },
  );

  await t.test(
    'a task on a harness this engine does not have is never spawned on the fallback, and one in flight is not ended `lost`, its grace long past',
    async () => {
      const sessions = new Map<string, Sighting>();
      const spawns: string[] = [];
      const told: string[] = [];
      const ops = testOps({ sessions });
      const claude = {
        ...ops,
        spawn: (r: SpawnRequest) =>
          Effect.suspend(() => {
            spawns.push(r.name);
            return ops.spawn(r);
          }),
        observeFor: (expected: readonly { name: string }[]) =>
          Effect.sync(() => {
            told.push(...expected.map((e) => e.name));
            return { seen: new Map(sessions), unread: new Set<string>() };
          }),
      };
      const layer = Layer.mergeAll(Journal.test(), Runner.layer(composite({ claude }, 'claude')), tickMemoLayer({ verify: true }));
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const ready = await run(file({ ...spec, harness: 'a2a:reviewer' }));
      const away = await run(file({ ...spec, harness: 'a2a:reviewer' }));
      const long = new Date(Date.now() - GRACE_MS - 10 * 60_000).toISOString();
      await run(
        Effect.flatMap(Journal, (j) =>
          Effect.all(
            [j.append(away, { kind: 'starting', at: long, attempt: 1 }), j.append(away, { kind: 'spawned', at: long, attempt: 1 })],
            {
              discard: true,
            },
          ),
        ),
      );
      await run(tick());
      await run(tick());
      assert.deepEqual(spawns, [], 'nothing was spawned on the fallback');
      assert.deepEqual(told, [], 'nor was the fallback told to look for a session of either');
      const readyEvents = await run(eventsOf(ready));
      const end = readyEvents.find((e) => e.kind === 'ended');
      assert.ok(end?.kind === 'ended' && end.reason === 'unstartable', JSON.stringify(readyEvents));
      assert.match(end.error ?? '', /`harness: a2a:reviewer` is not a harness this engine has/);
      const awayEvents = await run(eventsOf(away));
      assert.equal(
        awayEvents.some((e) => e.kind === 'ended' || e.kind === 'settled'),
        false,
        `neither there nor gone, so not ended: ${JSON.stringify(awayEvents)}`,
      );
    },
  );

  await t.test(
    "a harness whose look fails outright is said on the pass's report, after its name, and the other harnesses are read: on that pass alone",
    async () => {
      const claudeSessions = new Map<string, Sighting>();
      const codexSessions = new Map<string, Sighting>();
      let failing = false;
      let partWhy: string[] = [];
      const codex = testOps({ sessions: codexSessions });
      const layer = Layer.mergeAll(
        Journal.test(),
        Runner.layer(
          composite(
            {
              claude: flakyHarness(claudeSessions, () => failing),
              codex: {
                ...codex,
                observeFor: () =>
                  Effect.sync(() => ({
                    seen: new Map(codexSessions),
                    unread: new Set<string>(),
                    ...(partWhy.length ? { why: partWhy } : {}),
                  })),
              },
            },
            'claude',
          ),
        ),
        tickMemoLayer({ verify: true }),
      );
      const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
      const mine = await run(file({ ...spec, harness: 'claude' }));
      const other = await run(file({ ...spec, harness: 'codex' }));
      assert.deepEqual((await run(tick())).unobserved, [], 'every harness read: nothing said');

      failing = true;
      partWhy = ['its transcripts folder cannot be listed'];
      const failed = await run(tick());
      assert.deepEqual(failed.unobserved, [
        'harness `claude`: claude agents: timed out',
        'harness `codex`: its transcripts folder cannot be listed',
      ]);
      assert.equal(failed.views.find((v) => v.id === other)?.phase, 'working', "the other harness's session is read");
      assert.equal(failed.actions, 0, 'and nothing is done on the unread name');
      assert.ok(
        failed.views.some((v) => v.id === mine),
        'which is neither there nor gone',
      );

      failing = false;
      partWhy = [];
      assert.deepEqual((await run(tick())).unobserved, [], 'the next pass that reads says nothing: nothing is kept from the last');
    },
  );
});
