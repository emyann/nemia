/**
 * The file-backed journal and feed. The cursor is a byte offset, which is the part worth testing:
 * an off-by-one here means a consumer either misses an event or replays one forever.
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
import { asyncStore } from '../../../test/promise-runner.ts';

const root = () => scratch('ae-journal-');
/** A fresh layer over the same directory — what a restarted engine sees. */
const run = <A, E>(dir: string, e: Effect.Effect<A, E, Journal>) => Effect.runPromise(e.pipe(Effect.provide(Journal.files(dir))));

const ev = (kind: Event['kind'], at: string): Event => ({ kind, at, attempt: 1 }) as Event;
/** A task's `filed`, at `at`: what an append to a task with no journal must be. */
const filedAt = (at: string): Event => ({ ...TODAY, at }) as Event;
/** Each of `ids` filed, at the start of 2026, so the events a test appends after have a journal to go to. */
const fileEach = (ids: readonly string[]) =>
  Effect.flatMap(Journal, (j) => Effect.forEach(ids, (id) => j.append(id, filedAt('2026-01-01T00:00:00Z')), { discard: true }));

test('events come back in the order they were appended', async () => {
  const dir = root();
  await run(
    dir,
    fileEach(['t1']).pipe(
      Effect.andThen(
        Effect.flatMap(Journal, (j) =>
          Effect.forEach(['a', 'b', 'c'], (s) => j.append('t1', ev('starting', `2026-01-01T00:00:0${s.charCodeAt(0) - 97}Z`)), {
            discard: true,
          }),
        ),
      ),
    ),
  );

  const events = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t1')),
  );
  assert.equal(events.length, 4);
  assert.deepEqual(
    events.map((e) => `${e.kind} ${e.at.slice(-3, -1)}`),
    ['filed 00', 'starting 00', 'starting 01', 'starting 02'],
  );
});

test('the feed spans tasks and the cursor resumes exactly where it stopped', async () => {
  const dir = root();
  await run(
    dir,
    fileEach(['t1', 't2', 't3']).pipe(
      Effect.andThen(
        Effect.flatMap(Journal, (j) =>
          Effect.all([j.append('t1', ev('starting', '2026-01-01T00:00:00Z')), j.append('t2', ev('starting', '2026-01-01T00:00:01Z'))], {
            discard: true,
          }),
        ),
      ),
    ),
  );

  const first = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(0)),
  );
  assert.deepEqual(
    first.entries.map((e) => e.taskId),
    ['t1', 't2', 't3', 't1', 't2'],
  );
  assert.ok(first.cursor > 0);

  const caughtUp = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(first.cursor)),
  );
  assert.deepEqual(caughtUp.entries, [], 'a reader that has caught up sees nothing');
  assert.equal(caughtUp.cursor, first.cursor, 'and does not move');

  await run(
    dir,
    Effect.flatMap(Journal, (j) => j.append('t3', ev('spawned', '2026-01-01T00:00:02Z'))),
  );
  const next = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(first.cursor)),
  );
  assert.deepEqual(
    next.entries.map((e) => e.taskId),
    ['t3'],
    'then sees exactly what arrived after it',
  );

  const again = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(next.cursor)),
  );
  assert.deepEqual(again.entries, [], 'delivered once, not twice');
});

test('an old cursor replays everything since — it never expires', async () => {
  const dir = root();
  await run(
    dir,
    fileEach(['t1', 't2', 't3', 't4', 't5']).pipe(
      Effect.andThen(
        Effect.flatMap(Journal, (j) =>
          Effect.forEach([1, 2, 3, 4, 5], (n) => j.append(`t${n}`, ev('starting', `2026-01-01T00:00:0${n}Z`)), { discard: true }),
        ),
      ),
    ),
  );

  const all = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(0)),
  );
  assert.equal(all.entries.length, 10, 'a consumer away for a week replays rather than starting over');
});

test('a half-written trailing line is never handed to a consumer', async () => {
  const dir = root();
  await run(
    dir,
    fileEach(['t1']).pipe(Effect.andThen(Effect.flatMap(Journal, (j) => j.append('t1', ev('starting', '2026-01-01T00:00:00Z'))))),
  );
  fs.appendFileSync(path.join(dir, 'feed.jsonl'), '{"taskId":"t2","eve');

  const got = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(0)),
  );
  assert.deepEqual(
    got.entries.map((e) => e.taskId),
    ['t1', 't1'],
    'the partial line is not parsed',
  );

  fs.appendFileSync(path.join(dir, 'feed.jsonl'), 'nt":{"kind":"spawned","at":"2026-01-01T00:00:01Z","attempt":1}}\n');
  const after = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(got.cursor)),
  );
  assert.deepEqual(
    after.entries.map((e) => e.taskId),
    ['t2'],
    'the cursor stops before the partial line, so the line is delivered once it is complete',
  );
});

test('a missing board is empty, not an error', async () => {
  const dir = path.join(root(), 'never-used');
  assert.deepEqual(
    await run(
      dir,
      Effect.flatMap(Journal, (j) => j.list),
    ),
    [],
  );
  assert.deepEqual(
    await run(
      dir,
      Effect.flatMap(Journal, (j) => j.read('nope')),
    ),
    [],
  );
  assert.deepEqual(
    (
      await run(
        dir,
        Effect.flatMap(Journal, (j) => j.feed(0)),
      )
    ).entries,
    [],
  );
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

test("an old filed event is read with the harness's arguments under config, and nothing on disk is rewritten", async () => {
  const dir = legacyStore({ 't-old': [LEGACY, STARTING] });
  const before = bytesOf(dir);

  const [filed, starting] = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-old')),
  );
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

  const { entries } = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(0)),
  );
  assert.deepEqual(
    entries.map((e) => e.event),
    [filed, starting],
    'the feed reads the same shape as the task',
  );

  assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');
});

test('a store with tasks filed on both sides of the change reads them alike, and the engine folds each', async () => {
  const dir = legacyStore({ 't-new': [TODAY], 't-old': [LEGACY] });
  const { Engine } = await import('../../index.ts');
  const { builtEngine } = await import('../../../test/engine.ts');
  const engine = builtEngine(Engine.layer({ root: dir }));

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

test("config is the newer word: a value there is kept over one beside it, and an undefined one is no argument — in a consumer's store that keeps the key JSON drops", async () => {
  const dir = legacyStore({ t: [{ ...LEGACY, config: { model: 'haiku' } }], bare: [{ ...TODAY, config: undefined, model: undefined }] });
  const [both] = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t')),
  );
  assert.deepEqual((both as { config?: unknown }).config, {
    budgetUsd: 2,
    model: 'haiku',
    permissionMode: 'dontAsk',
    tools: ['Read'],
    worktree: true,
    contextTokens: 200000,
  });
  const [bare] = await Effect.runPromise(
    Effect.flatMap(Journal, (j) => j.read('bare')).pipe(
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
});

test("a consumer's own store is read in today's shape too: the upgrade is the Journal's, not the files'", async () => {
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

/**
 * A held-open task as a runtime that judged the spend cap journalled one: its cap beside `config`, a turn's cap on its
 * answer, and an end with `reason: 'budget'`, which `upgrade` reads as the harness's end at that limit.
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

test("a journal from a runtime that judged the spend cap reads its caps under config and a capped end as the harness's, with the limit beside it — and no byte on disk changes", async () => {
  const dir = legacyStore({ 't-capped': CAPPED });
  const before = bytesOf(dir);
  const events = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-capped')),
  );
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
  assert.deepEqual(events[3], CAPPED[3], 'an end at no limit is as written');
  assert.deepEqual(events[8], CAPPED[8], 'and what was settled stays settled, in its words');
  const { entries } = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(0)),
  );
  assert.deepEqual(
    entries.map((e) => e.event),
    events,
    'the feed reads the same shape as the task',
  );
  assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');

  const { Engine } = await import('../../index.ts');
  const { builtEngine } = await import('../../../test/engine.ts');
  const { state } = await Effect.runPromise(builtEngine(Engine.layer({ root: dir })).view('t-capped'));
  assert.deepEqual(state.inputs, [{ at: CAPPED[4].at, text: 'shorter', config: { budgetUsd: 0.5 } }]);
  assert.deepEqual(
    state.attempts.map((a) => [a.ended, a.reason, a.limit]),
    [
      ['done', 'harness', undefined],
      ['failed', 'harness', 'budget'],
    ],
  );
  assert.equal(state.config?.budgetUsd, 1);
});

test("an input's cap is laid under a config it already has, never over it: config is the newer word", async () => {
  const dir = legacyStore({ t: [{ ...CAPPED[4], config: { budgetUsd: 2 } }] });
  const [input] = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t')),
  );
  assert.deepEqual(input, { kind: 'input', at: CAPPED[4].at, text: 'shorter', config: { budgetUsd: 2 } });
});

test("a filing that asked for remoteControl, Claude Code's bridge to claude.ai, — under config, or beside it from before config — reads it as Claude Code's flag in config.claude, and no byte on disk changes", async () => {
  const dir = legacyStore({
    under: [{ ...TODAY, config: { background: true, remoteControl: true } }],
    beside: [{ ...TODAY, config: undefined, background: true, remoteControl: true }],
    both: [
      { ...TODAY, config: { background: true, remoteControl: true, claude: { appendSystemPromptFile: 'p.md', remoteControl: 'phone' } } },
    ],
    off: [{ ...TODAY, config: { model: 'haiku', remoteControl: false } }],
  });
  const before = bytesOf(dir);
  const read = async (id: string) =>
    (
      (
        await run(
          dir,
          Effect.flatMap(Journal, (j) => j.read(id)),
        )
      )[0] as { config?: unknown }
    ).config;
  assert.deepEqual(await read('under'), { background: true, claude: { remoteControl: true } });
  assert.deepEqual(await read('beside'), { background: true, claude: { remoteControl: true } });
  assert.deepEqual(
    await read('both'),
    { background: true, claude: { remoteControl: 'phone', appendSystemPromptFile: 'p.md' } },
    'a flag already in config.claude is the newer word, and is kept',
  );
  assert.deepEqual(
    Object.keys(((await read('both')) as { claude: object }).claude),
    ['remoteControl', 'appendSystemPromptFile'],
    'the bridge goes first, where the runtime gave it',
  );
  assert.deepEqual(await read('off'), { model: 'haiku' }, '`false` asked for nothing, and is no flag: dropped');
  const { entries } = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(0)),
  );
  assert.deepEqual(
    entries.find((e) => e.taskId === 'under')?.event,
    (
      await run(
        dir,
        Effect.flatMap(Journal, (j) => j.read('under')),
      )
    )[0],
    'the feed reads the same shape',
  );
  assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');

  const { Engine } = await import('../../index.ts');
  const { builtEngine } = await import('../../../test/engine.ts');
  const { state } = await Effect.runPromise(builtEngine(Engine.layer({ root: dir })).view('under'));
  assert.deepEqual(state.config, { background: true, claude: { remoteControl: true } });
});

const failureOf = <A>(dir: string, e: Effect.Effect<A, JournalError, Journal>) => run(dir, Effect.flip(e));

test('a journal line of a kind no runtime writes fails the read, naming the task, the entry and the kinds, and saying to take it out', async () => {
  const dir = legacyStore({ 't-bad': [TODAY, { kind: 'nudged', at: '2026-09-24T00:00:01Z' }] });
  const error = await failureOf(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.equal(error._tag, 'JournalError');
  assert.equal(error.taskId, 't-bad');
  assert.ok(
    error.message.startsWith(
      `t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')}), entry 2 is no event this runtime writes (its kind is "nudged"; the kinds are filed,`,
    ),
    error.message,
  );
  assert.ok(error.message.includes('take it out'), error.message);
});

test('an event of a known kind missing a field it always carries fails the read, naming the field', async () => {
  const { at: _, ...noTime } = TODAY;
  const dir = legacyStore({ 't-bad': [noTime] });
  const error = await failureOf(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.ok(
    error.message.startsWith(
      `t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')}), entry 1 is a \`filed\` event, and its \`at\` is missing.`,
    ),
    error.message,
  );
});

test('a field of the wrong type fails the read, saying what is there and what the runtime writes', async () => {
  const dir = legacyStore({
    't-bad': [TODAY, { kind: 'measured', at: '2026-09-24T00:00:01Z', attempt: 1, usage: { turns: 'three' } }],
  });
  const error = await failureOf(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.ok(
    error.message.startsWith(
      `t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')}), entry 2 is a \`measured\` event, and its \`usage.turns\` is "three", where the runtime writes number.`,
    ),
    error.message,
  );
});

test('a counted entry is read back as written; one whose usage no runtime wrote fails the read as a measured one does', async () => {
  const usage = { turns: 3, outputTokens: 40 };
  const good = legacyStore({ 't-ok': [TODAY, { kind: 'counted', at: '2026-09-24T00:00:01Z', attempt: 1, usage }] });
  const events = await run(
    good,
    Effect.flatMap(Journal, (j) => j.read('t-ok')),
  );
  assert.deepEqual(events.at(-1), { kind: 'counted', at: '2026-09-24T00:00:01Z', attempt: 1, usage });
  const dir = legacyStore({
    't-bad': [TODAY, { kind: 'counted', at: '2026-09-24T00:00:01Z', attempt: 1, usage: { turns: 'three' } }],
  });
  const error = await failureOf(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.ok(
    error.message.startsWith(
      `t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')}), entry 2 is a \`counted\` event, and its \`usage.turns\` is "three", where the runtime writes number.`,
    ),
    error.message,
  );
});

test('a denied entry is read back as written, with its call or without; one that names no tool fails the read, naming the field', async () => {
  const entries = [
    { kind: 'denied', at: '2026-09-24T00:00:01Z', attempt: 1, tool: 'Bash', what: 'ls' },
    { kind: 'denied', at: '2026-09-24T00:00:02Z', attempt: 1, tool: 'WebFetch' },
  ];
  const good = legacyStore({ 't-ok': [TODAY, ...entries] });
  const events = await run(
    good,
    Effect.flatMap(Journal, (j) => j.read('t-ok')),
  );
  assert.deepEqual(events.slice(1), entries);
  const dir = legacyStore({ 't-bad': [TODAY, { kind: 'denied', at: '2026-09-24T00:00:01Z', attempt: 1, what: 'ls' }] });
  const error = await failureOf(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.equal(error._tag, 'JournalError');
  assert.ok(
    error.message.startsWith(
      `t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')}), entry 2 is a \`denied\` event, and its \`tool\` is missing.`,
    ),
    error.message,
  );
});

test('the skills an end names are read back as written, an empty list kept; a list of anything but names fails the read', async () => {
  const end = (attempt: number, skills: unknown) => ({
    kind: 'ended',
    at: '2026-09-24T00:00:01Z',
    attempt,
    sessionId: 's',
    observed: 'done',
    reason: 'harness',
    skills,
  });
  const dir = legacyStore({ 't-skills': [TODAY, end(1, []), end(2, ['look'])] });
  const read = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-skills')),
  );
  assert.deepEqual(
    read.map((e) => (e.kind === 'ended' ? e.skills : undefined)),
    [undefined, [], ['look']],
  );
  const error = await failureOf(
    legacyStore({ 't-bad': [TODAY, end(1, 'look')] }),
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.ok(error.message.includes('entry 2 is a `ended` event, and its `skills` is "look"'), error.message);
});

test('the model an end names is read back as written, and folds onto the attempt; an end an older runtime wrote names none', async () => {
  const end = (attempt: number, model?: unknown) => ({
    kind: 'ended',
    at: '2026-09-24T00:00:01Z',
    attempt,
    sessionId: 's',
    observed: 'done',
    reason: 'harness',
    ...(model === undefined ? {} : { ranOn: model }),
  });
  const starting = (attempt: number) => ({ kind: 'starting', at: '2026-09-24T00:00:00Z', attempt, name: `ae-t-model-${attempt}` });
  const dir = legacyStore({ 't-model': [TODAY, starting(1), end(1), starting(2), end(2, 'claude-opus-5-5')] });
  const read = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-model')),
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
  const error = await failureOf(
    legacyStore({ 't-bad-model': [TODAY, starting(1), end(1, 5)] }),
    Effect.flatMap(Journal, (j) => j.read('t-bad-model')),
  );
  assert.ok(error.message.includes('entry 3 is a `ended` event, and its `ranOn` is 5'), error.message);
});

test('the files an end names are read back as written, an empty list kept; a list of anything but paths fails the read', async () => {
  const end = (attempt: number, files: unknown) => ({
    kind: 'ended',
    at: '2026-09-24T00:00:01Z',
    attempt,
    sessionId: 's',
    observed: 'done',
    reason: 'harness',
    files,
  });
  const dir = legacyStore({ 't-files': [TODAY, end(1, []), end(2, ['apps/web/a.tsx'])] });
  const read = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-files')),
  );
  assert.deepEqual(
    read.map((e) => (e.kind === 'ended' ? e.files : undefined)),
    [undefined, [], ['apps/web/a.tsx']],
  );
  const error = await failureOf(
    legacyStore({ 't-bad': [TODAY, end(1, 'b.ts')] }),
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.ok(error.message.includes('entry 2 is a `ended` event, and its `files` is "b.ts"'), error.message);
});

test('a harness argument of the wrong type is refused under config and beside it, where a journal from before config put it', async () => {
  for (const filed of [
    { ...TODAY, config: { tools: 'Read' } },
    { ...LEGACY, worktree: 3 },
  ]) {
    const dir = legacyStore({ 't-bad': [filed] });
    const error = await failureOf(
      dir,
      Effect.flatMap(Journal, (j) => j.read('t-bad')),
    );
    assert.ok(
      error.message.startsWith(`t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')}), entry 1 is a \`filed\` event, and its \``),
      error.message,
    );
  }
});

test("Codex's arguments are read from a journal as filed, and the engine folds them onto the task's config — and no byte on disk changes", async () => {
  const codex = { ...TODAY, config: { model: 'gpt-5', codex: { trustFrom: '/repo' } } };
  const dir = legacyStore({ 't-codex': [codex] });
  const before = bytesOf(dir);
  const [filed] = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-codex')),
  );
  assert.deepEqual(filed, codex);
  const { Engine } = await import('../../index.ts');
  const { builtEngine } = await import('../../../test/engine.ts');
  assert.deepEqual((await Effect.runPromise(builtEngine(Engine.layer({ root: dir })).view('t-codex'))).state.config, {
    model: 'gpt-5',
    codex: { trustFrom: '/repo' },
  });
  assert.deepEqual(bytesOf(dir), before);
});

test("a directory to extend Codex's trust from that is not a string fails the task's read, naming the field", async () => {
  const dir = legacyStore({ 't-bad': [{ ...TODAY, config: { codex: { trustFrom: 7 } } }] });
  const error = await failureOf(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-bad')),
  );
  assert.ok(
    error.message.startsWith(
      `t-bad's journal (${path.join(dir, 'tasks', 't-bad.jsonl')}), entry 1 is a \`filed\` event, and its \`config.codex.trustFrom\` is 7,`,
    ),
    error.message,
  );
});

test("a line of a task's journal cut short fails that task's read, naming the entry and what it reads", async () => {
  const dir = legacyStore({ 't-cut': [TODAY] });
  fs.appendFileSync(path.join(dir, 'tasks', 't-cut.jsonl'), '{"kind":"start\n');
  const error = await failureOf(
    dir,
    Effect.flatMap(Journal, (j) => j.read('t-cut')),
  );
  assert.ok(
    error.message.startsWith(
      `t-cut's journal (${path.join(dir, 'tasks', 't-cut.jsonl')}), entry 2 is no JSON object, as a write cut short leaves a line: it reads "{\\"kind\\":\\"start".`,
    ),
    error.message,
  );
});

test('a feed entry no runtime wrote is skipped and said, naming the file, the entry and the field, and the cursor is past it', async () => {
  const dir = legacyStore({ 't-ok': [TODAY] });
  const feedFile = path.join(dir, 'feed.jsonl');
  fs.appendFileSync(feedFile, JSON.stringify({ taskId: 3, event: STARTING }) + '\n');
  fs.appendFileSync(feedFile, JSON.stringify({ taskId: 't-odd', event: { kind: 'nudged', at: 'x' } }) + '\n');
  fs.appendFileSync(feedFile, '{"taskId":"t-cut","ev\n');
  fs.appendFileSync(feedFile, JSON.stringify({ taskId: 't-ok', event: STARTING }) + '\n');
  const read = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(0)),
  );
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
  assert.ok(
    noTask?.why.startsWith(
      `the feed (${feedFile}), entry 2 read from cursor 0 is no feed entry: its \`taskId\` is 3, where the runtime writes string.`,
    ),
    noTask?.why,
  );
  assert.equal(noKind?.taskId, 't-odd');
  assert.ok(
    noKind?.why.startsWith(`the feed (${feedFile}), entry 3 read from cursor 0 is no event this runtime writes (its kind is "nudged";`),
    noKind?.why,
  );
  assert.equal(cut?.taskId, undefined);
  assert.ok(cut?.why.startsWith(`the feed (${feedFile}), entry 4 read from cursor 0 is no JSON object`), cut?.why);
  const again = await run(
    dir,
    Effect.flatMap(Journal, (j) => j.feed(read.cursor)),
  );
  assert.deepEqual(again, { entries: [], cursor: read.cursor });
});

test('the in-memory store is decoded the same: an event appended in no shape the runtime writes is refused when read', async () => {
  const error = await Effect.runPromise(
    Effect.flatMap(Journal, (j) =>
      j.append('t-mem', { kind: 'filed', brief: 'b', cwd: '/r' } as never).pipe(Effect.andThen(j.read('t-mem'))),
    ).pipe(Effect.flip, Effect.provide(Journal.test())),
  );
  assert.ok(error.message.startsWith("t-mem's journal, entry 1 is a `filed` event, and its `at` is missing."), error.message);
});

test("a consumer's own store is decoded too: an entry it holds in no shape the runtime writes is said, not folded", async () => {
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
  await assert.rejects(Effect.runPromise(engine.view('t-own')), (e: Error) =>
    e.message.includes(`t-own's journal, entry 1 is no event this runtime writes (its kind is "filled"`),
  );
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
 * One `filesOps` over a fresh directory, a task journal of three events in it, filed first, and what its reads cost (`ioCounts`
 * deltas).
 */
const cursorStore = async () => {
  const dir = root();
  const ops = Journal.filesOps(dir);
  await Effect.runPromise(ops.append('t1', filedAt('2026-01-01T00:00:00Z')));
  for (const at of ['2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z']) await Effect.runPromise(ops.append('t1', ev('starting', at)));
  const file = path.join(dir, 'tasks', 't1.jsonl');
  const cost = async () => {
    const before = ioCounts();
    const entries = await Effect.runPromise(ops.read('t1'));
    const after = ioCounts();
    return { entries, bytes: after.bytesRead - before.bytesRead, reads: after.reads - before.reads };
  };
  return { dir, ops, file, cost };
};

test('a second read of a journal nothing has written to reads no byte', async () => {
  const { file, cost } = await cursorStore();
  const first = await cost();
  assert.equal(first.bytes, fs.statSync(file).size, 'the first read reads the whole journal');
  const second = await cost();
  assert.deepEqual([second.bytes, second.reads], [0, 0], 'the second reads nothing');
  assert.deepEqual(second.entries, first.entries, 'and gives the same entries');
});

test('a read after another writer appended one event reads only that line, and gives every event', async () => {
  const { dir, file, cost } = await cursorStore();
  await cost();
  const size = fs.statSync(file).size;
  await Effect.runPromise(Journal.filesOps(dir).append('t1', ev('spawned', '2026-01-01T00:00:03Z')));
  const line = fs.statSync(file).size - size;
  const after = await cost();
  assert.deepEqual([after.bytes, after.reads], [line, 1], `read ${after.bytes} bytes for an appended line of ${line}`);
  assert.deepEqual(
    after.entries.map((e) => (e as Event).at),
    ['2026-01-01T00:00:00Z', '2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z', '2026-01-01T00:00:03Z'],
  );
});

test('a journal replaced by a rename over it is read whole', async () => {
  const { dir, file, cost } = await cursorStore();
  await cost();
  const other = path.join(dir, 'tasks', 't1.next');
  fs.writeFileSync(other, fs.readFileSync(file, 'utf8') + JSON.stringify(ev('spawned', '2026-01-01T00:00:03Z')) + '\n');
  fs.renameSync(other, file);
  const after = await cost();
  assert.equal(after.bytes, fs.statSync(file).size, 'the whole of the new file');
  assert.equal(after.entries.length, 4);
});

test('a journal cut shorter is read whole', async () => {
  const { file, cost } = await cursorStore();
  await cost();
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  fs.writeFileSync(file, lines[0] + '\n');
  const after = await cost();
  assert.equal(after.bytes, fs.statSync(file).size, 'the whole of what is left');
  assert.equal(after.entries.length, 1);
});

test('a journal rewritten in place to the same size, at another time, is read whole', async () => {
  const { file, cost } = await cursorStore();
  await cost();
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

test('a journal gone reads as none, and one made again in its place is read whole', async () => {
  const { file, cost } = await cursorStore();
  await cost();
  const text = fs.readFileSync(file, 'utf8');
  fs.rmSync(file);
  const gone = await cost();
  assert.deepEqual([gone.entries, gone.bytes], [[], 0]);
  fs.writeFileSync(file, text.split('\n')[0] + '\n');
  const again = await cost();
  assert.equal(again.bytes, fs.statSync(file).size, 'the whole file');
  assert.equal(again.entries.length, 1);
});

test('a journal gone and made again as the same file, longer, is read whole', async () => {
  const { dir, file, cost } = await cursorStore();
  await cost();
  const aside = path.join(dir, 't1.aside');
  fs.linkSync(file, aside);
  fs.rmSync(file);
  const gone = await cost();
  assert.deepEqual([gone.entries, gone.bytes], [[], 0]);
  const ats = ['2026-01-02T00:00:00Z', '2026-01-02T00:00:01Z', '2026-01-02T00:00:02Z', '2026-01-02T00:00:03Z', '2026-01-02T00:00:04Z'];
  const { ino } = fs.statSync(aside);
  fs.writeFileSync(aside, [filedAt(ats[0]), ...ats.slice(1).map((at) => ev('starting', at))].map((e) => JSON.stringify(e) + '\n').join(''));
  fs.renameSync(aside, file);
  assert.equal(fs.statSync(file).ino, ino, 'the same file as the one read before it went');
  const again = await cost();
  assert.equal(again.bytes, fs.statSync(file).size, 'the whole file');
  assert.deepEqual(
    again.entries.map((e) => (e as Event).at),
    ats,
  );
});

test('a last line cut short fails the read as it always has, and once completed is read for its bytes alone', async () => {
  const { dir, ops, file, cost } = await cursorStore();
  await cost();
  const size = fs.statSync(file).size;
  fs.appendFileSync(file, '{"kind":"spawned","at":"2026-01');
  const error = await Effect.runPromise(Effect.flip(Effect.flatMap(Journal, (j) => j.read('t1')).pipe(Effect.provide(Journal.layer(ops)))));
  assert.ok(error.message.startsWith(`t1's journal (${path.join(dir, 'tasks', 't1.jsonl')}), entry 4 is no JSON object`), error.message);
  fs.appendFileSync(file, '-01T00:00:03Z","attempt":1}\n');
  const after = await cost();
  assert.equal(after.bytes, fs.statSync(file).size - size, 'the cut line and its end, never what came before it');
  assert.deepEqual(
    after.entries.map((e) => (e as Event).kind),
    ['filed', 'starting', 'starting', 'spawned'],
  );
});
