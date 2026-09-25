/**
 * The file-backed journal and feed. The cursor is a byte offset, which is the part worth testing:
 * an off-by-one here means a consumer either misses an event or replays one forever.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { Journal } from '../src/journal.ts';
import type { Event } from '../src/domain.ts';
import { scratch } from './scratch.ts';

const root = () => scratch('ae-journal-');
/** A fresh layer over the same directory — what a restarted engine sees. */
const run = <A, E>(dir: string, e: Effect.Effect<A, E, Journal>) =>
  Effect.runPromise(e.pipe(Effect.provide(Journal.files(dir))));

const ev = (kind: Event['kind'], at: string): Event => ({ kind, at, attempt: 1 } as Event);

test('events come back in the order they were appended', async () => {
  const dir = root();
  await run(dir, Effect.flatMap(Journal, (j) =>
    Effect.forEach(['a', 'b', 'c'], (s) => j.append('t1', ev('starting', `2026-01-01T00:00:0${s.charCodeAt(0) - 97}Z`)), { discard: true })));

  const events = await run(dir, Effect.flatMap(Journal, (j) => j.read('t1')));
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.at.slice(-3, -1)), ['00', '01', '02']);
});

test('the feed spans tasks and the cursor resumes exactly where it stopped', async () => {
  const dir = root();
  await run(dir, Effect.flatMap(Journal, (j) =>
    Effect.all([j.append('t1', ev('starting', '2026-01-01T00:00:00Z')), j.append('t2', ev('starting', '2026-01-01T00:00:01Z'))], { discard: true })));

  const first = await run(dir, Effect.flatMap(Journal, (j) => j.feed(0)));
  assert.deepEqual(first.entries.map((e) => e.taskId), ['t1', 't2']);
  assert.ok(first.cursor > 0);

  // A reader that has caught up sees nothing and does not move.
  const caughtUp = await run(dir, Effect.flatMap(Journal, (j) => j.feed(first.cursor)));
  assert.deepEqual(caughtUp.entries, []);
  assert.equal(caughtUp.cursor, first.cursor);

  // ...and then sees exactly what arrived after it, once.
  await run(dir, Effect.flatMap(Journal, (j) => j.append('t3', ev('spawned', '2026-01-01T00:00:02Z'))));
  const next = await run(dir, Effect.flatMap(Journal, (j) => j.feed(first.cursor)));
  assert.deepEqual(next.entries.map((e) => e.taskId), ['t3']);

  const again = await run(dir, Effect.flatMap(Journal, (j) => j.feed(next.cursor)));
  assert.deepEqual(again.entries, [], 'delivered once, not twice');
});

test('an old cursor replays everything since — it never expires', async () => {
  const dir = root();
  await run(dir, Effect.flatMap(Journal, (j) =>
    Effect.forEach([1, 2, 3, 4, 5], (n) => j.append(`t${n}`, ev('starting', `2026-01-01T00:00:0${n}Z`)), { discard: true })));

  const all = await run(dir, Effect.flatMap(Journal, (j) => j.feed(0)));
  assert.equal(all.entries.length, 5, 'a consumer away for a week replays rather than starting over');
});

test('a half-written trailing line is never handed to a consumer', async () => {
  const dir = root();
  await run(dir, Effect.flatMap(Journal, (j) => j.append('t1', ev('starting', '2026-01-01T00:00:00Z'))));
  // Simulate a write caught mid-flight.
  fs.appendFileSync(path.join(dir, 'feed.jsonl'), '{"taskId":"t2","eve');

  const got = await run(dir, Effect.flatMap(Journal, (j) => j.feed(0)));
  assert.deepEqual(got.entries.map((e) => e.taskId), ['t1'], 'the partial line is not parsed');

  // And the cursor stops before it, so the line is delivered once it is complete.
  fs.appendFileSync(path.join(dir, 'feed.jsonl'), 'nt":{"kind":"spawned","at":"2026-01-01T00:00:01Z","attempt":1}}\n');
  const after = await run(dir, Effect.flatMap(Journal, (j) => j.feed(got.cursor)));
  assert.deepEqual(after.entries.map((e) => e.taskId), ['t2']);
});

test('a missing board is empty, not an error', async () => {
  const dir = path.join(root(), 'never-used');
  assert.deepEqual(await run(dir, Effect.flatMap(Journal, (j) => j.list)), []);
  assert.deepEqual(await run(dir, Effect.flatMap(Journal, (j) => j.read('nope'))), []);
  assert.deepEqual((await run(dir, Effect.flatMap(Journal, (j) => j.feed(0)))).entries, []);
});

// ─── a journal written before the harness's arguments moved under `config` ───

/** A `filed` line as the engine wrote one until 2026-09-23: the harness's arguments beside the task's own fields. */
const LEGACY = {
  kind: 'filed', at: '2026-09-01T00:00:00Z', brief: 'b', cwd: '/r', budgetUsd: 2,
  model: 'opus', permissionMode: 'dontAsk', tools: ['Read'], worktree: true, contextTokens: 200000,
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
  [path.join(dir, 'feed.jsonl'), ...fs.readdirSync(path.join(dir, 'tasks')).map((f) => path.join(dir, 'tasks', f))]
    .map((f) => fs.readFileSync(f, 'utf8'));

test("an old filed event is read with the harness's arguments under config, and nothing on disk is rewritten", async () => {
  const dir = legacyStore({ 't-old': [LEGACY, STARTING] });
  const before = bytesOf(dir);

  const [filed, starting] = await run(dir, Effect.flatMap(Journal, (j) => j.read('t-old')));
  // The spend cap was the task's own field then, and is one of the harness's arguments since stage 4b: lifted with them.
  assert.deepEqual(filed, {
    kind: 'filed', at: LEGACY.at, brief: 'b', cwd: '/r',
    config: { budgetUsd: 2, model: 'opus', permissionMode: 'dontAsk', tools: ['Read'], worktree: true, contextTokens: 200000 },
  });
  assert.deepEqual(starting, STARTING, 'an event that never carried them is as written');

  const { entries } = await run(dir, Effect.flatMap(Journal, (j) => j.feed(0)));
  assert.deepEqual(entries.map((e) => e.event), [filed, starting], 'the feed reads the same shape as the task');

  assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');
});

test('a store with tasks filed on both sides of the change reads them alike, and the engine folds each', async () => {
  const dir = legacyStore({ 't-new': [TODAY], 't-old': [LEGACY] });
  const { createEngine } = await import('../src/facade.ts');
  const engine = createEngine({ root: dir });

  const old = await engine.view('t-old');
  assert.deepEqual(old.state.config, { budgetUsd: 2, model: 'opus', permissionMode: 'dontAsk', tools: ['Read'], worktree: true, contextTokens: 200000 });
  assert.equal((old.state as unknown as Record<string, unknown>).model, undefined, 'no argument is left on the state beside it');
  assert.equal('budgetUsd' in old.state, false, 'the cap included');
  assert.deepEqual((await engine.view('t-new')).state.config, { model: 'haiku' });
});

test('config is the newer word: a value there is kept over one beside it, and an undefined one is no argument', async () => {
  const dir = legacyStore({ t: [{ ...LEGACY, config: { model: 'haiku' } }], bare: [{ ...TODAY, config: undefined, model: undefined }] });
  const [both] = await run(dir, Effect.flatMap(Journal, (j) => j.read('t')));
  assert.deepEqual((both as { config?: unknown }).config, { budgetUsd: 2, model: 'haiku', permissionMode: 'dontAsk', tools: ['Read'], worktree: true, contextTokens: 200000 });
  // JSON drops an undefined, so this is the in-memory case: a consumer's store that kept the key.
  const [bare] = await Effect.runPromise(Effect.flatMap(Journal, (j) => j.read('bare')).pipe(Effect.provide(Journal.layer({
    append: () => Effect.void, list: Effect.succeed(['bare']), feed: () => Effect.succeed({ entries: [], cursor: 0 }),
    read: () => Effect.succeed([{ ...TODAY, config: undefined, model: undefined } as unknown as Event]),
  }))));
  assert.ok(!('model' in bare) && !('config' in bare), JSON.stringify(bare));
});

test("a consumer's own store is read in today's shape too: the upgrade is the Journal's, not the files'", async () => {
  const { createEngine } = await import('../src/facade.ts');
  const events = [LEGACY as unknown as Event];
  const engine = createEngine({
    journal: {
      append: async () => {}, read: async () => events, list: async () => ['t-old'],
      feed: async () => ({ entries: events.map((event) => ({ taskId: 't-old', event })), cursor: 1 }),
    },
  });
  assert.deepEqual((await engine.view('t-old')).state.config?.model, 'opus');
  assert.deepEqual(events[0], LEGACY, "and the consumer's record is not touched");
});

// ─── a journal written while the runtime judged the spend cap (until stage 4b, 2026-09-25) ───

/** A held-open task as the engine journalled one in stage 4a: its cap beside `config`, a turn's cap on its answer, a capped end. */
const CAPPED = [
  { kind: 'filed', at: '2026-09-24T00:00:00Z', brief: 'b', cwd: '/r', holdOpen: true, budgetUsd: 1, config: { model: 'haiku' } },
  { kind: 'starting', at: '2026-09-24T00:00:01Z', attempt: 1 },
  { kind: 'spawned', at: '2026-09-24T00:00:02Z', attempt: 1 },
  { kind: 'ended', at: '2026-09-24T00:00:03Z', attempt: 1, sessionId: 's-1', observed: 'done', reason: 'harness', nativeId: 'n-1' },
  { kind: 'input', at: '2026-09-24T00:01:00Z', text: 'shorter', budgetUsd: 0.5 },
  { kind: 'starting', at: '2026-09-24T00:01:01Z', attempt: 2, resumeFrom: 'n-1', nudge: 'shorter' },
  { kind: 'spawned', at: '2026-09-24T00:01:02Z', attempt: 2 },
  { kind: 'ended', at: '2026-09-24T00:01:03Z', attempt: 2, sessionId: 's-2', observed: 'failed', reason: 'budget', nativeId: 'n-1', exitCode: 1 },
  { kind: 'settled', at: '2026-09-24T00:01:04Z', outcome: 'failed', note: 'attempt 2 spent its budget. File the task again with a larger one to run it again' },
];

test("a journal from before stage 4b reads its caps under config and a capped end as the harness's, with the limit beside it — and no byte on disk changes", async () => {
  const dir = legacyStore({ 't-capped': CAPPED });
  const before = bytesOf(dir);
  const events = await run(dir, Effect.flatMap(Journal, (j) => j.read('t-capped')));
  assert.deepEqual(events[0], { kind: 'filed', at: CAPPED[0]!.at, brief: 'b', cwd: '/r', holdOpen: true, config: { budgetUsd: 1, model: 'haiku' } });
  assert.deepEqual(events[4], { kind: 'input', at: CAPPED[4]!.at, text: 'shorter', config: { budgetUsd: 0.5 } }, "a turn's cap is that turn's configuration");
  assert.deepEqual(events[7], { ...CAPPED[7], reason: 'harness', limit: 'budget' }, 'the end the runtime judged `budget` is the harness ending it at that limit');
  assert.deepEqual(events[3], CAPPED[3], 'an end at no limit is as written');
  assert.deepEqual(events[8], CAPPED[8], 'and what was settled stays settled, in its words');
  const { entries } = await run(dir, Effect.flatMap(Journal, (j) => j.feed(0)));
  assert.deepEqual(entries.map((e) => e.event), events, 'the feed reads the same shape as the task');
  assert.deepEqual(bytesOf(dir), before, 'append-only: a read changes no byte');

  const { createEngine } = await import('../src/facade.ts');
  const { state } = await createEngine({ root: dir }).view('t-capped');
  assert.deepEqual(state.inputs, [{ at: CAPPED[4]!.at, text: 'shorter', config: { budgetUsd: 0.5 } }]);
  assert.deepEqual(state.attempts.map((a) => [a.ended, a.reason, a.limit]), [['done', 'harness', undefined], ['failed', 'harness', 'budget']]);
  assert.equal(state.config?.budgetUsd, 1);
});

test("an input's cap is laid under a config it already has, never over it: config is the newer word", async () => {
  const dir = legacyStore({ t: [{ ...CAPPED[4], config: { budgetUsd: 2 } }] });
  const [input] = await run(dir, Effect.flatMap(Journal, (j) => j.read('t')));
  assert.deepEqual(input, { kind: 'input', at: CAPPED[4]!.at, text: 'shorter', config: { budgetUsd: 2 } });
});
