/**
 * The file-backed journal and feed. The cursor is a byte offset, which is the part worth testing:
 * an off-by-one here means a consumer either misses an event or replays one forever.
 *
 * What every layer of the Task door answers alike — an append read back in order, the list, the feed resumed from a cursor, the task's
 * invariants — is walked on each (`test/journal-walks.ts`). This file holds what the files alone do: told as one story — an engine's
 * pass and a reader over a board reading only what was appended, a torn last line never handed on — then two tables: the journals an
 * older runtime wrote, read in today's shape, and the entries no runtime wrote, each failing its read by name. The edges of the
 * incremental read (a journal replaced, cut, rewritten, gone), the files store's own refusals under the feed's lock and the schema's
 * completeness stay focused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { Journal, type JournalError } from './journal.ts';
import { fold, type Event, type Usage } from '../domain.ts';
import { HarnessArgsSchema, type StoredEvent } from '../event-schema.ts';
import type { HarnessArgs } from '../../harness/args.ts';
import { ioCounts } from './tally.ts';
import { scratch } from '../../../test/scratch.ts';
import { asyncOps, asyncStore, type AsyncRunner, type AsyncSighting } from '../../../test/promise-runner.ts';
import { story } from '../../../test/checkpoints.ts';
import { TaskId } from '../model.ts';

const root = () => scratch('ae-journal-');
/** A fresh layer over the same directory — what a restarted engine sees. */
const run = <A, E>(dir: string, e: Effect.Effect<A, E, Journal>) => Effect.runPromise(e.pipe(Effect.provide(Journal.files(dir))));
const readOf = (id: string) => Effect.flatMap(Journal, (j) => j.read(TaskId.read(id)));
const feedFrom = (after: number) => Effect.flatMap(Journal, (j) => j.feed(after));

const ev = (kind: Event['kind'], at: string, attempt = 1): Event => ({ kind, at, attempt }) as Event;
/** A task's `filed`, at `at`: what an append to a task with no journal must be. */
const filedAt = (at: string): Event => ({ ...TODAY, at }) as Event;
/** Each of `ids` filed, at the start of 2026, so the events a test appends after have a journal to go to. */
const fileEach = (ids: readonly string[]) =>
  Effect.flatMap(Journal, (j) =>
    Effect.forEach(ids, (id) => j.append(TaskId.read(id), filedAt('2026-01-01T00:00:00Z')), { discard: true }),
  );

/** What reading `t1`'s journal through `ops` costs (`ioCounts` deltas), and what it gives. */
const costOf = async (ops: ReturnType<typeof Journal.filesOps>, taskId = 't1') => {
  const before = ioCounts();
  const entries = await Effect.runPromise(ops.read(taskId));
  const after = ioCounts();
  return { entries, bytes: after.bytesRead - before.bytesRead, reads: after.reads - before.reads };
};

/** How many tasks the story's engine files and keeps at work. */
const N = 12;

test('a board on files is read for what was appended alone: by a pass, a view and a fresh reader, a torn last line never handed on', async (t) => {
  const s = story(t);
  const board = path.join(root(), 'board');
  const sessions = new Map<string, AsyncSighting>();
  const working: AsyncRunner = {
    spawn: async (r) => {
      sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' });
    },
    observe: async () => new Map(sessions),
    stop: async () => {},
    logs: async () => '',
  };
  const { Engine } = await import('../../index.ts');
  const { builtEngine } = await import('../../../test/engine.ts');
  const engine = builtEngine(Engine.layer({ root: board, harnesses: { working: asyncOps(working) }, defaultHarness: 'working' }));
  const feedFile = path.join(board, 'feed.jsonl');
  const sizeOf = (file: string) => fs.statSync(file).size;
  const ids: string[] = [];

  await s.test('a pass over tasks at work whose journals nothing has written to reads no byte', async () => {
    const cwd = scratch('ae-cursor-cwd-');
    for (let i = 0; i < N; i++) ids.push(await Effect.runPromise(engine.file({ brief: `task ${i}`, cwd })));
    let size = -1;
    while (size !== sizeOf(feedFile)) {
      size = sizeOf(feedFile);
      await Effect.runPromise(engine.tick());
    }
    assert.equal((await Effect.runPromise(engine.tick())).views.length, N, 'every task is at work, none settled');
    const before = Effect.runSync(engine.io());
    const report = await Effect.runPromise(engine.tick());
    const after = Effect.runSync(engine.io());
    assert.equal(report.views.length, N, 'every task is still judged');
    assert.equal(after.bytesRead - before.bytesRead, 0, 'no byte read');
    assert.equal(after.reads - before.reads, 0, 'no read made');
  });

  await s.test('a view of a task at work whose journal nothing has written to reads no byte', async () => {
    const before = Effect.runSync(engine.io());
    const view = await Effect.runPromise(engine.view(ids[0]));
    assert.ok(!view.state.settled, 'the task is at work');
    assert.equal(Effect.runSync(engine.io()).bytesRead - before.bytesRead, 0);
  });

  await s.test(
    "a pass after another writer appends one event to one task's journal reads that line and the feed's growth, and nothing else",
    async () => {
      const journal = path.join(board, 'tasks', `${ids[4]}.jsonl`);
      const [feed0, journal0] = [sizeOf(feedFile), sizeOf(journal)];
      const at = new Date().toISOString();
      await Effect.runPromise(Journal.filesOps(board).append(ids[4], { kind: 'input', at, attempt: 1, text: 'more' } as never));
      const [grown, appended] = [sizeOf(feedFile) - feed0, sizeOf(journal) - journal0];
      assert.ok(grown > 0 && appended > 0, 'the event was written to the journal and the feed');

      const before = Effect.runSync(engine.io());
      await Effect.runPromise(engine.tick());
      const read = Effect.runSync(engine.io()).bytesRead - before.bytesRead;
      const wrote = sizeOf(feedFile) - feed0 - grown;
      assert.equal(wrote, 0, 'the pass wrote nothing of its own');
      assert.equal(read, grown + appended, `read ${read}; the feed grew ${grown} and the journal ${appended}`);
    },
  );

  await s.test('a half-written trailing line is never handed to a consumer', async () => {
    const end = sizeOf(feedFile);
    const whole = (await run(board, feedFrom(0))).entries.map((e) => e.taskId);
    fs.appendFileSync(feedFile, '{"taskId":"t2","eve');
    const got = await run(board, feedFrom(0));
    assert.deepEqual(
      got.entries.map((e) => e.taskId),
      whole,
      'the partial line is not parsed',
    );
    assert.equal(got.cursor, end, 'and the cursor stops before it');
    fs.appendFileSync(feedFile, 'nt":{"kind":"spawned","at":"2026-01-01T00:00:01Z","attempt":1}}\n');
    const after = await run(board, feedFrom(got.cursor));
    assert.deepEqual(
      after.entries.map((e) => e.taskId),
      ['t2'],
      'the cursor stops before the partial line, so the line is delivered once it is complete',
    );
  });

  await s.test('a second read of a journal nothing has written to reads no byte', async () => {
    await run(
      board,
      fileEach(['t1']).pipe(
        Effect.andThen(
          Effect.flatMap(Journal, (j) =>
            Effect.forEach([1, 2, 3], (n) => j.append(TaskId.read('t1'), ev('starting', `2026-01-01T00:00:0${n - 1}Z`, n)), {
              discard: true,
            }),
          ),
        ),
      ),
    );
    const ops = Journal.filesOps(board);
    const file = path.join(board, 'tasks', 't1.jsonl');
    const first = await costOf(ops);
    assert.equal(first.bytes, sizeOf(file), 'the first read reads the whole journal');
    const second = await costOf(ops);
    assert.deepEqual([second.bytes, second.reads], [0, 0], 'the second reads nothing');
    assert.deepEqual(second.entries, first.entries, 'and gives the same entries');

    const size = sizeOf(file);
    await Effect.runPromise(Journal.filesOps(board).append('t1', ev('spawned', '2026-01-01T00:00:03Z')));
    const line = sizeOf(file) - size;
    const after = await costOf(ops);
    assert.deepEqual([after.bytes, after.reads], [line, 1], `read ${after.bytes} bytes for an appended line of ${line}`);
    assert.deepEqual(
      after.entries.map((e) => (e as Event).at),
      ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z', '2026-01-01T00:00:03Z'],
      'a read after another writer appended one event reads only that line, and gives every event',
    );
  });
});

/**
 * A `filed` line an older runtime wrote: the harness's arguments beside the task's own fields, where `upgrade` reads them
 * under `config`.
 */
const LEGACY = {
  kind: 'filed',
  at: '2026-09-01T00:00:00Z',
  brief: 'b',
  cwd: '/r',
  budgetUsd: 2,
  model: 'opus',
  permissionMode: 'dontAsk',
  tools: ['Read'],
  worktree: true,
  contextTokens: 200000,
};
const TODAY = { kind: 'filed', at: '2026-09-24T00:00:00Z', brief: 'b', cwd: '/r', config: { model: 'haiku' } };
const STARTING = { kind: 'starting', at: '2026-09-01T00:00:01Z', attempt: 1, name: 'ae-t-old-1' };

/** A store on disk with `lines` for each task, in the task files and the feed, as they were written. */
const legacyStore = (tasks: Record<string, object[]>) => {
  const dir = root();
  fs.mkdirSync(path.join(dir, 'tasks'));
  for (const [id, lines] of Object.entries(tasks)) {
    fs.writeFileSync(path.join(dir, 'tasks', `${id}.jsonl`), lines.map((l) => JSON.stringify(l) + '\n').join(''));
    fs.appendFileSync(path.join(dir, 'feed.jsonl'), lines.map((event) => JSON.stringify({ taskId: id, event }) + '\n').join(''));
  }
  return dir;
};
const bytesOf = (dir: string) =>
  [path.join(dir, 'feed.jsonl'), ...fs.readdirSync(path.join(dir, 'tasks')).map((f) => path.join(dir, 'tasks', f))].map((f) =>
    fs.readFileSync(f, 'utf8'),
  );

/** An engine over the files store at `dir`, as a restarted daemon builds it. */
const engineOver = async (dir: string) => {
  const { Engine } = await import('../../index.ts');
  const { builtEngine } = await import('../../../test/engine.ts');
  return builtEngine(Engine.layer({ root: dir }));
};

/**
 * A held-open task as a runtime that judged the spend cap journalled one: its cap beside `config`, a turn's cap on its
 * answer, and an end with `reason: 'budget'`, which `upgrade` reads as the harness's end at that limit, and an end
 * observed `done`, which it reads as `succeeded`.
 */
const CAPPED = [
  { kind: 'filed', at: '2026-09-24T00:00:00Z', brief: 'b', cwd: '/r', holdOpen: true, budgetUsd: 1, config: { model: 'haiku' } },
  { kind: 'starting', at: '2026-09-24T00:00:01Z', attempt: 1 },
  { kind: 'spawned', at: '2026-09-24T00:00:02Z', attempt: 1 },
  { kind: 'ended', at: '2026-09-24T00:00:03Z', attempt: 1, sessionId: 's-1', observed: 'done', reason: 'harness', nativeId: 'n-1' },
  { kind: 'input', at: '2026-09-24T00:01:00Z', text: 'shorter', budgetUsd: 0.5 },
  { kind: 'starting', at: '2026-09-24T00:01:01Z', attempt: 2, resumeFrom: 'n-1', nudge: 'shorter' },
  { kind: 'spawned', at: '2026-09-24T00:01:02Z', attempt: 2 },
  {
    kind: 'ended',
    at: '2026-09-24T00:01:03Z',
    attempt: 2,
    sessionId: 's-2',
    observed: 'failed',
    reason: 'budget',
    nativeId: 'n-1',
    exitCode: 1,
  },
  {
    kind: 'settled',
    at: '2026-09-24T00:01:04Z',
    outcome: 'failed',
    note: 'attempt 2 spent its budget. File the task again with a larger one to run it again',
  },
];

test("upgrade: a journal an older runtime wrote, or a consumer's own store holds, reads in today's shape, and no byte on disk changes", async (t) => {
  await t.test("an old filed event is read with the harness's arguments under config, and nothing on disk is rewritten", async () => {
    const dir = legacyStore({ 't-old': [LEGACY, STARTING] });
    const before = bytesOf(dir);
    const [filed, starting] = await run(dir, readOf('t-old'));
    assert.deepEqual(
      filed,
      {
        kind: 'filed',
        at: LEGACY.at,
        brief: 'b',
        cwd: '/r',
        config: { budgetUsd: 2, model: 'opus', permissionMode: 'dontAsk', tools: ['Read'], worktree: true, contextTokens: 200000 },
      },
      "the spend cap beside the task's fields is one of the harness's arguments: lifted under config with them",
    );
    assert.deepEqual(starting, STARTING, 'an event that never carried them is as written');
    const { entries } = await run(dir, feedFrom(0));
    assert.deepEqual(
      entries.map((e) => e.event),
      [filed, starting],
      'the feed reads the same shape as the task',
    );
    assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');
  });

  await t.test('a store with tasks filed on both sides of the change reads them alike, and the engine folds each', async () => {
    const engine = await engineOver(legacyStore({ 't-new': [TODAY], 't-old': [LEGACY] }));
    const old = await Effect.runPromise(engine.view('t-old'));
    assert.deepEqual(old.state.config, {
      budgetUsd: 2,
      model: 'opus',
      permissionMode: 'dontAsk',
      tools: ['Read'],
      worktree: true,
      contextTokens: 200000,
    });
    assert.equal((old.state as unknown as Record<string, unknown>).model, undefined, 'no argument is left on the state beside it');
    assert.equal('budgetUsd' in old.state, false, 'the cap included');
    assert.deepEqual((await Effect.runPromise(engine.view('t-new'))).state.config, { model: 'haiku' });
  });

  await t.test(
    "config is the newer word: a value there is kept over one beside it, and an undefined one is no argument — in a consumer's store that keeps the key JSON drops",
    async () => {
      const dir = legacyStore({
        t: [{ ...LEGACY, config: { model: 'haiku' } }],
        bare: [{ ...TODAY, config: undefined, model: undefined }],
      });
      const [both] = await run(dir, readOf('t'));
      assert.deepEqual((both as { config?: unknown }).config, {
        budgetUsd: 2,
        model: 'haiku',
        permissionMode: 'dontAsk',
        tools: ['Read'],
        worktree: true,
        contextTokens: 200000,
      });
      const [bare] = await Effect.runPromise(
        readOf('bare').pipe(
          Effect.provide(
            Journal.layer({
              append: () => Effect.void,
              list: Effect.succeed(['bare']),
              feed: () => Effect.succeed({ entries: [], cursor: 0 }),
              read: () => Effect.succeed([{ ...TODAY, config: undefined, model: undefined } as unknown as Event]),
            }),
          ),
        ),
      );
      assert.ok(!('model' in bare) && !('config' in bare), JSON.stringify(bare));
    },
  );

  await t.test("a consumer's own store is read in today's shape too: the upgrade is the Journal's, not the files'", async () => {
    const { Engine } = await import('../../index.ts');
    const { builtEngine } = await import('../../../test/engine.ts');
    const events = [LEGACY as unknown as Event];
    const engine = builtEngine(
      Engine.layer({
        root: scratch('ae-journal-root-'),
        journal: asyncStore({
          append: async () => {},
          read: async () => events,
          list: async () => ['t-old'],
          feed: async () => ({ entries: events.map((event) => ({ taskId: 't-old', event })), cursor: 1 }),
        }),
      }),
    );
    assert.deepEqual((await Effect.runPromise(engine.view('t-old'))).state.config?.model, 'opus');
    assert.deepEqual(events[0], LEGACY, "and the consumer's record is not touched");
  });

  await t.test(
    "a journal from a runtime that judged the spend cap reads its caps under config and a capped end as the harness's, with the limit beside it — and no byte on disk changes",
    async () => {
      const dir = legacyStore({ 't-capped': CAPPED });
      const before = bytesOf(dir);
      const events = await run(dir, readOf('t-capped'));
      assert.deepEqual(events[0], {
        kind: 'filed',
        at: CAPPED[0].at,
        brief: 'b',
        cwd: '/r',
        holdOpen: true,
        config: { budgetUsd: 1, model: 'haiku' },
      });
      assert.deepEqual(
        events[4],
        { kind: 'input', at: CAPPED[4].at, text: 'shorter', config: { budgetUsd: 0.5 } },
        "a turn's cap is that turn's configuration",
      );
      assert.deepEqual(
        events[7],
        { ...CAPPED[7], reason: 'harness', limit: 'budget' },
        'the end the runtime judged `budget` is the harness ending it at that limit',
      );
      assert.deepEqual(
        events[3],
        { ...CAPPED[3], observed: 'succeeded' },
        'an end at no limit is as written, its former `done` read as `succeeded`',
      );
      assert.deepEqual(events[8], CAPPED[8], 'and what was settled stays settled, in its words');
      const { entries } = await run(dir, feedFrom(0));
      assert.deepEqual(
        entries.map((e) => e.event),
        events,
        'the feed reads the same shape as the task',
      );
      assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');

      const { state } = await Effect.runPromise((await engineOver(dir)).view('t-capped'));
      assert.deepEqual(state.inputs, [{ at: CAPPED[4].at, text: 'shorter', config: { budgetUsd: 0.5 } }]);
      assert.deepEqual(
        state.attempts.map((a) => [a.ended, a.reason, a.limit]),
        [
          ['succeeded', 'harness', undefined],
          ['failed', 'harness', 'budget'],
        ],
      );
      assert.equal(state.config?.budgetUsd, 1);
    },
  );

  await t.test("an input's cap is laid under a config it already has, never over it: config is the newer word", async () => {
    const [input] = await run(legacyStore({ t: [{ ...CAPPED[4], config: { budgetUsd: 2 } }] }), readOf('t'));
    assert.deepEqual(input, { kind: 'input', at: CAPPED[4].at, text: 'shorter', config: { budgetUsd: 2 } });
  });

  await t.test(
    "a filing that asked for remoteControl, Claude Code's bridge to claude.ai, — under config, or beside it from before config — reads it as Claude Code's flag in config.claude, and no byte on disk changes",
    async () => {
      const dir = legacyStore({
        under: [{ ...TODAY, config: { background: true, remoteControl: true } }],
        beside: [{ ...TODAY, config: undefined, background: true, remoteControl: true }],
        both: [
          {
            ...TODAY,
            config: { background: true, remoteControl: true, claude: { appendSystemPromptFile: 'p.md', remoteControl: 'phone' } },
          },
        ],
        off: [{ ...TODAY, config: { model: 'haiku', remoteControl: false } }],
      });
      const before = bytesOf(dir);
      const read = async (id: string) => ((await run(dir, readOf(id)))[0] as { config?: unknown }).config;
      assert.deepEqual(await read('under'), { claude: { remoteControl: true } });
      assert.deepEqual(await read('beside'), { claude: { remoteControl: true } });
      assert.deepEqual(
        await read('both'),
        { claude: { remoteControl: 'phone', appendSystemPromptFile: 'p.md' } },
        'a flag already in config.claude is the newer word, and is kept',
      );
      assert.deepEqual(
        Object.keys(((await read('both')) as { claude: object }).claude),
        ['remoteControl', 'appendSystemPromptFile'],
        'the bridge goes first, where the runtime gave it',
      );
      assert.deepEqual(await read('off'), { model: 'haiku' }, '`false` asked for nothing, and is no flag: dropped');
      const { entries } = await run(dir, feedFrom(0));
      assert.deepEqual(
        entries.find((e) => e.taskId === 'under')?.event,
        (await run(dir, readOf('under')))[0],
        'the feed reads the same shape',
      );
      assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');
      const { state } = await Effect.runPromise((await engineOver(dir)).view('under'));
      assert.deepEqual(state.config, { claude: { remoteControl: true } });
    },
  );

  await t.test(
    'a filing that asked for `background`, the `claude --bg` road this runtime no longer runs — under config, or beside it — reads without it, the rest of its config kept, and no byte on disk changes',
    async () => {
      const dir = legacyStore({
        on: [{ ...TODAY, config: { background: true, model: 'haiku' } }],
        off: [{ ...TODAY, config: { background: false } }],
        beside: [{ ...TODAY, config: { model: 'haiku' }, background: true }],
        held: [{ ...TODAY, restartPolicy: 'Always', config: { background: true, claude: { remoteControl: true } } }],
      });
      const before = bytesOf(dir);
      const filed = async (id: string) =>
        (await run(dir, readOf(id)))[0] as { config?: unknown; background?: unknown; restartPolicy?: unknown };
      assert.deepEqual((await filed('on')).config, { model: 'haiku' });
      assert.equal((await filed('off')).config, undefined, 'a config that held nothing else is no config');
      const beside = await filed('beside');
      assert.deepEqual([beside.config, Object.hasOwn(beside, 'background')], [{ model: 'haiku' }, false], 'beside config: dropped too');
      const held = await filed('held');
      assert.deepEqual(
        [held.restartPolicy, held.config],
        ['Always', { claude: { remoteControl: true } }],
        'a long-lived session stays one',
      );
      assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');
      const { state } = await Effect.runPromise((await engineOver(dir)).view('held'));
      assert.deepEqual(state.config, { claude: { remoteControl: true } });
    },
  );

  await t.test(
    "Codex's arguments are read from a journal as filed, and the engine folds them onto the task's config — and no byte on disk changes",
    async () => {
      const codex = { ...TODAY, config: { model: 'gpt-5', codex: { trustFrom: '/repo' } } };
      const dir = legacyStore({ 't-codex': [codex] });
      const before = bytesOf(dir);
      const [filed] = await run(dir, readOf('t-codex'));
      assert.deepEqual(filed, codex);
      assert.deepEqual((await Effect.runPromise((await engineOver(dir)).view('t-codex'))).state.config, {
        model: 'gpt-5',
        codex: { trustFrom: '/repo' },
      });
      assert.deepEqual(bytesOf(dir), before);
    },
  );

  await t.test(
    "a journal written before the runtime's words took their names reads in today's — closedOut, responses, projectMcp, a former reason as the harness's end — and no byte on disk changes",
    async () => {
      const dir = legacyStore({ 't-words': RENAMED });
      const before = bytesOf(dir);
      const events = await run(dir, readOf('t-words'));
      const [filed, , , quiet, input, , , measured, counted, unstated] = RENAMED;
      assert.deepEqual(events[0], { ...filed, config: { model: 'haiku', projectMcp: ['repo'] } }, 'the servers kept by their new name');
      assert.deepEqual(
        events[3],
        { ...quiet, reason: 'harness', closedOut: false, former: 'unsigned', usage: { responses: 3 } },
        "a former reason is the harness's end with no statement, the reason it was written with kept as `former`",
      );
      assert.deepEqual(events[4], { ...input, config: { projectMcp: [] } }, "a turn's configuration by its new name too");
      assert.deepEqual(events[7], { ...measured, usage: { responses: 1, toolCalls: 2 } });
      assert.deepEqual(events[8], { ...counted, usage: { responses: 2 } });
      const { stated: _, ...unsaid } = unstated as { stated?: boolean };
      assert.deepEqual(
        events[9],
        { ...unsaid, closedOut: false, usage: { responses: 2 } },
        'an end with no statement says so by its new name',
      );
      const read = JSON.stringify(events);
      for (const left of ['"checkoutMcp"', '"stated"', '"turns"', '"reason":"unsigned"'])
        assert.ok(!read.includes(left), `${left} in ${read}`);
      const { entries } = await run(dir, feedFrom(0));
      assert.deepEqual(
        entries.map((e) => e.event),
        events,
        'the feed reads the same shape as the task',
      );
      assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');
      const { state } = await Effect.runPromise((await engineOver(dir)).view('t-words'));
      assert.deepEqual(state.config, { model: 'haiku', projectMcp: ['repo'] });
      assert.deepEqual(
        state.attempts.map((a) => [a.ended, a.reason, a.closedOut, a.former, a.usage?.responses]),
        [
          ['failed', 'harness', false, 'unsigned', 3],
          ['succeeded', 'harness', false, undefined, 2],
        ],
      );
    },
  );
});

/**
 * A held-open task as a runtime wrote it before its words took their names: the servers of its checkout's `.mcp.json` named
 * under `checkoutMcp`, on its filing and a turn's; an end the runtime judged by a reason of its own, its usage counted in
 * `turns`; a measure and a count in `turns`; and an end with no statement written `stated: false`.
 */
const RENAMED = [
  { ...TODAY, holdOpen: true, config: { model: 'haiku', checkoutMcp: ['repo'] } },
  { kind: 'starting', at: '2026-09-24T00:00:01Z', attempt: 1 },
  { kind: 'spawned', at: '2026-09-24T00:00:02Z', attempt: 1 },
  {
    kind: 'ended',
    at: '2026-09-24T00:00:03Z',
    attempt: 1,
    sessionId: 's-1',
    observed: 'failed',
    reason: 'unsigned',
    nativeId: 'n-1',
    usage: { turns: 3 },
  },
  { kind: 'input', at: '2026-09-24T00:01:00Z', text: 'again', config: { checkoutMcp: [] } },
  { kind: 'starting', at: '2026-09-24T00:01:01Z', attempt: 2, resumeFrom: 'n-1', nudge: 'again' },
  { kind: 'spawned', at: '2026-09-24T00:01:02Z', attempt: 2 },
  { kind: 'measured', at: '2026-09-24T00:01:03Z', attempt: 2, usage: { turns: 1, toolCalls: 2 } },
  { kind: 'counted', at: '2026-09-24T00:01:04Z', attempt: 2, usage: { turns: 2 } },
  {
    kind: 'ended',
    at: '2026-09-24T00:01:05Z',
    attempt: 2,
    sessionId: 's-2',
    observed: 'succeeded',
    reason: 'harness',
    nativeId: 'n-1',
    stated: false,
    usage: { turns: 2 },
  },
];

const failureOf = <A>(dir: string, e: Effect.Effect<A, JournalError, Journal>) => run(dir, Effect.flip(e));

/** Asserts `words` holds each of `names`: the entry, the field, what is there — the names a person needs to find the line. */
const naming = (words: string | undefined, ...names: string[]) => {
  for (const name of names) assert.ok(words?.includes(name), `${JSON.stringify(name)} in: ${words}`);
};

/** The refusal of a read of `t-bad`'s journal holding `lines`: a `JournalError` on that task, naming its file. */
const refusedRead = async (lines: object[]) => {
  const dir = legacyStore({ 't-bad': lines });
  const error = await failureOf(dir, readOf('t-bad'));
  assert.equal(error._tag, 'JournalError');
  assert.equal(error.taskId, 't-bad');
  naming(error.message, `t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')})`);
  return error;
};

test('decode: an entry no runtime wrote fails its read, naming the task, the entry and its first wrong field; one it wrote is read back as written', async (t) => {
  await t.test(
    'a journal line of a kind no runtime writes fails the read, naming the task, the entry and the kinds, and saying to take it out',
    async () => {
      const error = await refusedRead([TODAY, { kind: 'nudged', at: '2026-09-24T00:00:01Z' }]);
      naming(error.message, 'entry 2 is no event', '"nudged"', 'the kinds are filed,', 'take it out');
    },
  );

  await t.test('an event of a known kind missing a field it always carries fails the read, naming the field', async () => {
    const { at: _, ...noTime } = TODAY;
    const error = await refusedRead([noTime]);
    naming(error.message, 'entry 1 is a `filed` event', '`at` is missing');
  });

  await t.test('a field of the wrong type fails the read, saying what is there and what the runtime writes', async () => {
    const error = await refusedRead([TODAY, { kind: 'measured', at: '2026-09-24T00:00:01Z', attempt: 1, usage: { responses: 'three' } }]);
    naming(error.message, 'entry 2 is a `measured` event', '`usage.responses` is "three"', 'writes number');
  });

  await t.test(
    'a counted entry is read back as written; one whose usage no runtime wrote fails the read as a measured one does',
    async () => {
      const usage = { responses: 3, outputTokens: 40 };
      const events = await run(
        legacyStore({ 't-ok': [TODAY, { kind: 'counted', at: '2026-09-24T00:00:01Z', attempt: 1, usage }] }),
        readOf('t-ok'),
      );
      assert.deepEqual(events.at(-1), { kind: 'counted', at: '2026-09-24T00:00:01Z', attempt: 1, usage });
      const error = await refusedRead([TODAY, { kind: 'counted', at: '2026-09-24T00:00:01Z', attempt: 1, usage: { responses: 'three' } }]);
      naming(error.message, 'entry 2 is a `counted` event', '`usage.responses` is "three"', 'writes number');
    },
  );

  await t.test(
    'a denied entry is read back as written, with its call or without; one that names no tool fails the read, naming the field',
    async () => {
      const entries = [
        { kind: 'denied', at: '2026-09-24T00:00:01Z', attempt: 1, tool: 'Bash', what: 'ls' },
        { kind: 'denied', at: '2026-09-24T00:00:02Z', attempt: 1, tool: 'WebFetch' },
      ];
      const events = await run(legacyStore({ 't-ok': [TODAY, ...entries] }), readOf('t-ok'));
      assert.deepEqual(events.slice(1), entries);
      const error = await refusedRead([TODAY, { kind: 'denied', at: '2026-09-24T00:00:01Z', attempt: 1, what: 'ls' }]);
      naming(error.message, 'entry 2 is a `denied` event', '`tool` is missing');
    },
  );

  const end = (attempt: number, more: object) => ({
    kind: 'ended',
    at: '2026-09-24T00:00:01Z',
    attempt,
    sessionId: 's',
    observed: 'succeeded',
    reason: 'harness',
    ...more,
  });

  await t.test(
    'the skills an end names are read back as written, an empty list kept; a list of anything but names fails the read',
    async () => {
      const read = await run(
        legacyStore({ 't-skills': [TODAY, end(1, { skills: [] }), end(2, { skills: ['look'] })] }),
        readOf('t-skills'),
      );
      assert.deepEqual(
        read.map((e) => (e.kind === 'ended' ? e.skills : undefined)),
        [undefined, [], ['look']],
      );
      const error = await refusedRead([TODAY, end(1, { skills: 'look' })]);
      naming(error.message, 'entry 2 is a `ended` event, and its `skills` is "look"');
    },
  );

  await t.test(
    'the model an end names is read back as written, and folds onto the attempt; an end an older runtime wrote names none',
    async () => {
      const starting = (attempt: number) => ({ kind: 'starting', at: '2026-09-24T00:00:00Z', attempt, name: `ae-t-model-${attempt}` });
      const read = await run(
        legacyStore({ 't-model': [TODAY, starting(1), end(1, {}), starting(2), end(2, { ranOn: 'claude-opus-5-5' })] }),
        readOf('t-model'),
      );
      assert.deepEqual(
        read.map((e) => (e.kind === 'ended' ? e.ranOn : undefined)),
        [undefined, undefined, undefined, undefined, 'claude-opus-5-5'],
        'an end an older runtime wrote carries no model, and nothing is invented for it',
      );
      assert.deepEqual(
        fold('t-model', read).attempts.map((a) => a.ranOn),
        [undefined, 'claude-opus-5-5'],
        "and the model an end does name is the attempt's, so a person reading a task sees which model its session ran on",
      );
      const error = await refusedRead([TODAY, starting(1), end(1, { ranOn: 5 })]);
      naming(error.message, 'entry 3 is a `ended` event, and its `ranOn` is 5');
    },
  );

  await t.test(
    'the files an end names are read back as written, an empty list kept; a list of anything but paths fails the read',
    async () => {
      const read = await run(
        legacyStore({ 't-files': [TODAY, end(1, { files: [] }), end(2, { files: ['apps/web/a.tsx'] })] }),
        readOf('t-files'),
      );
      assert.deepEqual(
        read.map((e) => (e.kind === 'ended' ? e.files : undefined)),
        [undefined, [], ['apps/web/a.tsx']],
      );
      const error = await refusedRead([TODAY, end(1, { files: 'b.ts' })]);
      naming(error.message, 'entry 2 is a `ended` event, and its `files` is "b.ts"');
    },
  );

  await t.test(
    'a harness argument of the wrong type is refused under config and beside it, where a journal from before config put it',
    async () => {
      const under = await refusedRead([{ ...TODAY, config: { tools: 'Read' } }]);
      naming(under.message, 'entry 1 is a `filed` event, and its `', 'tools');
      const beside = await refusedRead([{ ...LEGACY, worktree: 3 }]);
      naming(beside.message, 'entry 1 is a `filed` event, and its `', 'worktree');
    },
  );

  await t.test("a directory to extend Codex's trust from that is not a string fails the task's read, naming the field", async () => {
    const error = await refusedRead([{ ...TODAY, config: { codex: { trustFrom: 7 } } }]);
    naming(error.message, 'entry 1 is a `filed` event', '`config.codex.trustFrom` is 7,');
  });

  await t.test("a line of a task's journal cut short fails that task's read, naming the entry and what it reads", async () => {
    const dir = legacyStore({ 't-cut': [TODAY] });
    fs.appendFileSync(path.join(dir, 'tasks', 't-cut.jsonl'), '{"kind":"start\n');
    const error = await failureOf(dir, readOf('t-cut'));
    assert.deepEqual([error._tag, error.taskId], ['JournalError', 't-cut']);
    naming(
      error.message,
      `t-cut's journal (${path.join(dir, 'tasks', 't-cut.jsonl')})`,
      'entry 2 is no JSON object',
      '"{\\"kind\\":\\"start"',
    );
  });

  await t.test(
    'a feed entry no runtime wrote is skipped and said, naming the file, the entry and the field, and the cursor is past it',
    async () => {
      const dir = legacyStore({ 't-ok': [TODAY] });
      const feedFile = path.join(dir, 'feed.jsonl');
      fs.appendFileSync(feedFile, JSON.stringify({ taskId: 3, event: STARTING }) + '\n');
      fs.appendFileSync(feedFile, JSON.stringify({ taskId: 't-odd', event: { kind: 'nudged', at: 'x' } }) + '\n');
      fs.appendFileSync(feedFile, '{"taskId":"t-cut","ev\n');
      fs.appendFileSync(feedFile, JSON.stringify({ taskId: 't-ok', event: STARTING }) + '\n');
      const read = await run(dir, feedFrom(0));
      assert.deepEqual(
        read.entries.map((e) => [e.taskId, e.event.kind]),
        [
          ['t-ok', 'filed'],
          ['t-ok', 'starting'],
        ],
      );
      assert.equal(read.cursor, fs.statSync(feedFile).size);
      const [noTask, noKind, cut] = read.refused ?? [];
      assert.equal(read.refused?.length, 3);
      assert.equal(noTask?.taskId, undefined);
      naming(noTask?.why, `the feed (${feedFile}), entry 2 read from cursor 0 is no feed entry`, '`taskId` is 3', 'writes string');
      assert.equal(noKind?.taskId, 't-odd');
      naming(noKind?.why, `the feed (${feedFile}), entry 3 read from cursor 0 is no event`, '"nudged"');
      assert.equal(cut?.taskId, undefined);
      naming(cut?.why, `the feed (${feedFile}), entry 4 read from cursor 0 is no JSON object`);
      const again = await run(dir, feedFrom(read.cursor));
      assert.deepEqual(again, { entries: [], cursor: read.cursor });
    },
  );

  await t.test(
    'the in-memory store is decoded the same: an event appended in no shape the runtime writes is refused when read',
    async () => {
      const error = await Effect.runPromise(
        Effect.flatMap(Journal, (j) =>
          j
            .append(TaskId.read('t-mem'), { kind: 'filed', brief: 'b', cwd: '/r' } as never)
            .pipe(Effect.andThen(j.read(TaskId.read('t-mem')))),
        ).pipe(Effect.flip, Effect.provide(Journal.test())),
      );
      assert.deepEqual([error._tag, error.taskId], ['JournalError', 't-mem']);
      naming(error.message, "t-mem's journal, entry 1 is a `filed` event", '`at` is missing');
    },
  );

  await t.test("a consumer's own store is decoded too: an entry it holds in no shape the runtime writes is said, not folded", async () => {
    const { Engine } = await import('../../index.ts');
    const { builtEngine } = await import('../../../test/engine.ts');
    const events = [{ ...TODAY, kind: 'filled' } as unknown as Event];
    const engine = builtEngine(
      Engine.layer({
        root: scratch('ae-journal-root-'),
        journal: asyncStore({
          append: async () => {},
          read: async () => events,
          list: async () => ['t-own'],
          feed: async () => ({ entries: [], cursor: 0 }),
        }),
      }),
    );
    await assert.rejects(Effect.runPromise(engine.view('t-own')), (e: Error) => {
      naming(e.message, "t-own's journal, entry 1 is no event", 'this runtime writes', '(its kind is "filled"');
      return true;
    });
  });
});

/** The keys a type names, without the keys of its index signature. */
type Named<T> = keyof { [K in keyof T as string extends K ? never : K]: T[K] };
/** Each kind's fields `Event` has and the stored schema forgot: none, or the assignment below does not compile. */
type Forgotten = {
  [K in Event['kind']]: Exclude<Named<Extract<Event, { kind: K }>>, Named<Extract<StoredEvent, { kind: K }>>>;
}[Event['kind']];
type ForgottenArgs = Exclude<Named<HarnessArgs>, Named<typeof HarnessArgsSchema.Type>>;
type ForgottenUsage = Exclude<Named<Usage>, Named<NonNullable<Extract<StoredEvent, { kind: 'measured' }>['usage']>>>;

test('the stored schema names every field of every event, of the harness arguments and of the usage: a field added to one is added to it', () => {
  const none: [Forgotten, ForgottenArgs, ForgottenUsage] extends [never, never, never] ? true : [Forgotten, ForgottenArgs, ForgottenUsage] =
    true;
  assert.equal(none, true);
});

/**
 * One `filesOps` over a fresh directory, a task journal of three events in it, filed first, read once, and what its reads cost
 * (`ioCounts` deltas).
 */
const cursorStore = async () => {
  const dir = root();
  const ops = Journal.filesOps(dir);
  await Effect.runPromise(ops.append('t1', filedAt('2026-01-01T00:00:00Z')));
  for (const at of ['2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z']) await Effect.runPromise(ops.append('t1', ev('starting', at)));
  const file = path.join(dir, 'tasks', 't1.jsonl');
  const cost = () => costOf(ops);
  await cost();
  return { dir, ops, file, cost };
};

test('a journal changed under its reader other than by an append is read whole', async (t) => {
  await t.test('a journal replaced by a rename over it is read whole', async () => {
    const { dir, file, cost } = await cursorStore();
    const other = path.join(dir, 'tasks', 't1.next');
    fs.writeFileSync(other, fs.readFileSync(file, 'utf8') + JSON.stringify(ev('spawned', '2026-01-01T00:00:03Z')) + '\n');
    fs.renameSync(other, file);
    const after = await cost();
    assert.equal(after.bytes, fs.statSync(file).size, 'the whole of the new file');
    assert.equal(after.entries.length, 4);
  });

  await t.test('a journal cut shorter is read whole', async () => {
    const { file, cost } = await cursorStore();
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    fs.writeFileSync(file, lines[0] + '\n');
    const after = await cost();
    assert.equal(after.bytes, fs.statSync(file).size, 'the whole of what is left');
    assert.equal(after.entries.length, 1);
  });

  await t.test('a journal rewritten in place to the same size, at another time, is read whole', async () => {
    const { file, cost } = await cursorStore();
    const { mtimeMs, ino } = fs.statSync(file);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('00:00:0', '11:11:1'));
    fs.utimesSync(file, new Date(mtimeMs + 5000), new Date(mtimeMs + 5000));
    assert.equal(fs.statSync(file).ino, ino, 'the same file');
    const after = await cost();
    assert.equal(after.bytes, fs.statSync(file).size, 'the whole file');
    assert.deepEqual(
      after.entries.map((e) => (e as Event).at),
      ['2026-01-01T11:11:10Z', '2026-01-01T11:11:11Z', '2026-01-01T11:11:12Z'],
    );
  });

  await t.test('a journal gone reads as none, and one made again in its place is read whole', async () => {
    const { file, cost } = await cursorStore();
    const text = fs.readFileSync(file, 'utf8');
    fs.rmSync(file);
    const gone = await cost();
    assert.deepEqual([gone.entries, gone.bytes], [[], 0]);
    fs.writeFileSync(file, text.split('\n')[0] + '\n');
    const again = await cost();
    assert.equal(again.bytes, fs.statSync(file).size, 'the whole file');
    assert.equal(again.entries.length, 1);
  });

  await t.test('a journal gone and made again as the same file, longer, is read whole', async () => {
    const { dir, file, cost } = await cursorStore();
    const aside = path.join(dir, 't1.aside');
    fs.linkSync(file, aside);
    fs.rmSync(file);
    const gone = await cost();
    assert.deepEqual([gone.entries, gone.bytes], [[], 0]);
    const ats = ['2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z', '2026-01-02T00:00:02Z', '2026-01-02T00:00:03Z', '2026-01-02T00:00:04Z'];
    const { ino } = fs.statSync(aside);
    fs.writeFileSync(
      aside,
      [filedAt(ats[0]), ...ats.slice(1).map((at) => ev('starting', at))].map((e) => JSON.stringify(e) + '\n').join(''),
    );
    fs.renameSync(aside, file);
    assert.equal(fs.statSync(file).ino, ino, 'the same file as the one read before it went');
    const again = await cost();
    assert.equal(again.bytes, fs.statSync(file).size, 'the whole file');
    assert.deepEqual(
      again.entries.map((e) => (e as Event).at),
      ats,
    );
  });
});

test('a last line cut short fails the read as it always has, and once completed is read for its bytes alone', async () => {
  const { dir, ops, file, cost } = await cursorStore();
  const size = fs.statSync(file).size;
  fs.appendFileSync(file, '{"kind":"spawned","at":"2026-01');
  const error = await Effect.runPromise(Effect.flip(readOf('t1').pipe(Effect.provide(Journal.layer(ops)))));
  naming(error.message, `t1's journal (${path.join(dir, 'tasks', 't1.jsonl')}), entry 4 is no JSON object`);
  fs.appendFileSync(file, '-01T00:00:03Z","attempt":1}\n');
  const after = await cost();
  assert.equal(after.bytes, fs.statSync(file).size - size, 'the cut line and its end, never what came before it');
  assert.deepEqual(
    after.entries.map((e) => (e as Event).kind),
    ['filed', 'starting', 'starting', 'spawned'],
  );
});

test("the files store refuses by itself, under the feed's lock, a second filing and an entry to a task with no journal, so two writers cannot both pass the door's check", async (t) => {
  const board = root();
  const ops = Journal.filesOps(board);
  const appended = (taskId: string, event: Event) =>
    Effect.runPromise(Effect.result(ops.append(taskId, event))).then((r) => (r._tag === 'Failure' ? r.failure.reason : 'taken'));
  await t.test('a filing to a task with no journal is taken', async () => {
    assert.equal(await appended('a', filedAt('2026-01-01T00:00:00Z')), 'taken');
  });
  await t.test('a second filing is refused filed-twice, and the journal keeps one line', async () => {
    assert.equal(await appended('a', filedAt('2026-01-01T00:00:01Z')), 'filed-twice');
    assert.equal((await Effect.runPromise(ops.read('a'))).length, 1);
  });
  await t.test('an entry to a task with no journal is refused not-filed, and no journal is made', async () => {
    assert.equal(await appended('b', ev('starting', '2026-01-01T00:00:02Z')), 'not-filed');
    assert.equal(fs.existsSync(path.join(board, 'tasks', 'b.jsonl')), false);
  });
});
