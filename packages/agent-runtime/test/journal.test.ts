/**
 * The file-backed journal and feed. The cursor is a byte offset, which is the part worth testing:
 * an off-by-one here means a consumer either misses an event or replays one forever.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Journal } from '../src/journal.ts';
import type { Event } from '../src/domain.ts';

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ae-journal-'));
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
