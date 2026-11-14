/**
 * The feed's lines as Events (`eventList`, `eventObject`, event.verb.ts; `eventOf`, event.ts), over the Feed door's memory stand-in: a v0
 * line and its v1 form are served alike, a reason this nemia does not know is served `Unknown`, a page walked by `continue` reads the
 * next lines in feed order, a namespace's list holds no daemon's line, and an Event is read by the byte its line starts at — a byte
 * inside a line, or a namespace the event is not in, is `Missing`. And over the files, that an Event read by its byte reads its own line
 * and not the feed after it, its bytes counted by a metered pass (`meteredPass`). Kinds are asserted, never sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit, Layer, Schema } from 'effect';
import { Event, EventList } from 'objects';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { meteredPass } from '../meter/tally.store.ts';
import { FeedDoor, feedDoorFiles, feedDoorOver, feedFiles } from '../feed/feed.store.ts';
import { feedDoorMemory } from '../feed/memory.store.ts';
import { upgraded, type FeedLine } from '../feed/feed.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { eventOf } from './event.ts';
import { eventList, eventObject } from './event.verb.ts';

const AT = '2026-11-01T00:00:00.000Z';

/** A run's line as an older nemia wrote it: no version, no involved, no labels. */
const v0: FeedLine = { at: AT, run: 'r-1', word: 'running' };

/** The same line as this nemia writes it. */
const v1: FeedLine = {
  at: AT,
  run: 'r-1',
  word: 'running',
  apiVersion: 'nemia/v1',
  involved: { kind: 'Run', name: 'r-1' },
  labels: { run: 'r-1' },
  reason: 'Running',
  type: 'Normal',
  source: 'tick',
  message: 'running',
};

/** A run's line in the factory `mill`. */
const inMill = (run: string): FeedLine => ({
  at: AT,
  run,
  word: 'running',
  apiVersion: 'nemia/v1',
  involved: { kind: 'Run', name: run },
  labels: { run, factory: 'mill' },
  reason: 'Running',
  type: 'Normal',
  source: 'tick',
  message: 'running',
});

/** A daemon's line, which names no factory. */
const daemon: FeedLine = { at: AT, daemon: 42, word: 'daemon started' };

/** Runs `program` on a fresh memory feed holding `lines`, appended in order. */
const over = <A, E>(lines: readonly FeedLine[], program: Effect.Effect<A, E>) =>
  Effect.runSyncExit(
    Effect.gen(function* () {
      const door = yield* FeedDoor;
      yield* door.lines.append(lines);
      return yield* program;
    }).pipe(Effect.provide(feedDoorMemory())),
  );

const value = <A, E>(exit: Exit.Exit<A, E>): A => {
  assert.ok(Exit.isSuccess(exit), `expected a success, got ${String(exit)}`);
  return exit.value;
};

const failure = <A, E>(exit: Exit.Exit<A, E>): unknown => {
  assert.ok(Exit.isFailure(exit), 'expected a failure');
  const err = exit.cause.reasons.find((r) => r._tag === 'Fail');
  assert.ok(err !== undefined && err._tag === 'Fail', 'expected a refusal');
  return err.error;
};

const decode = Schema.decodeUnknownSync(Event);

test('a v0 line and its v1 form are served as the same Event, which decodes', () => {
  const list = value(over([v0, v1], eventList({})));
  Schema.decodeUnknownSync(EventList)(list);
  const [a, b] = list.items;
  assert.ok(a !== undefined && b !== undefined);
  const strip = (e: Event) => ({ ...e, metadata: { ...e.metadata, name: '', resourceVersion: '' } });
  assert.deepEqual(strip(decode(a)), strip(decode(b)));
  assert.equal(a.reason, 'Running');
  assert.equal(a.metadata.namespace, 'default');
  assert.deepEqual(a.involved, { kind: 'Run', name: 'r-1' });
  assert.equal(a.metadata.name, '0');
  assert.equal(b.metadata.name, a.metadata.resourceVersion);
});

test("a person's act is served with who acted where its line says, and a line that names none with none", () => {
  const actor = { kind: 'agent', agent: 'operator', token: 'ops' } as const;
  const approved: FeedLine = {
    ...v1,
    step: 'plan',
    word: 'approved',
    reason: 'Approved',
    source: 'person',
    message: 'approved',
    note: `try 1 · at ${AT}`,
    try: 1,
    actor,
  };
  const event = decode(eventOf(approved, 0, 10));
  assert.equal(event.reason, 'Approved');
  assert.deepEqual(event.actor, actor);
  assert.equal('actor' in decode(eventOf(v1, 0, 10)), false);
});

test('a reason this nemia does not know is served Unknown, its type and source the table says of Unknown', () => {
  const line = { ...inMill('r-2'), reason: 'Frobbed', type: 'Severe', source: 'robot' } as unknown as FeedLine;
  const event = decode(eventOf(line, 0, 10));
  assert.equal(event.reason, 'Unknown');
  assert.equal(event.type, 'Warning');
  assert.equal(event.source, 'tick');
  assert.equal(event.metadata.namespace, 'mill');
  assert.equal(event.metadata.resourceVersion, '10');
});

test("a factory's conflicts line is served as an Event about the factory, in its namespace, its reason and type the table's", () => {
  const signed: FeedLine = {
    at: AT,
    factory: 'mill',
    word: 'conflicts pending',
    note: 'agents/coder.md: choose one',
    apiVersion: 'nemia/v1',
    involved: { kind: 'Factory', name: 'mill' },
    labels: { factory: 'mill' },
    reason: 'ConflictsPending',
    type: 'Normal',
    source: 'tick',
    message: 'conflicts pending · agents/coder.md: choose one',
  };
  const read = upgraded({ at: AT, factory: 'mill', word: 'conflicts pending', labels: { factory: 'mill' } });
  for (const line of [signed, read]) {
    const event = decode(eventOf(line, 0, 10));
    assert.deepEqual(event.involved, { kind: 'Factory', name: 'mill' });
    assert.equal(event.metadata.namespace, 'mill');
    assert.equal(event.reason, 'ConflictsPending');
    assert.equal(event.type, 'Normal');
  }
});

test('a page of 2 reads on by continue in feed order, the last counting nothing left', () => {
  const lines = ['r-c', 'r-a', 'r-d', 'r-b'].map(inMill);
  const first = value(over(lines, eventList({ limit: 2 })));
  assert.deepEqual(
    first.items.map((e) => e.involved.name),
    ['r-c', 'r-a'],
  );
  assert.equal(first.metadata.remainingItemCount, undefined, 'a page that is not the last read no further than one line past it');
  const token = first.metadata.continue;
  assert.ok(token !== undefined);
  const second = value(over(lines, eventList({ limit: 2, continue: token })));
  assert.deepEqual(
    second.items.map((e) => e.involved.name),
    ['r-d', 'r-b'],
  );
  assert.equal(second.metadata.remainingItemCount, 0);
  assert.equal(second.metadata.continue, undefined);
  assert.equal(second.items[0]?.metadata.name, first.items[1]?.metadata.resourceVersion);
});

test("a page's resourceVersion is the feed's end as read, on a page with a continue too, and 0 for no feed", () => {
  const lines = ['r-c', 'r-a', 'r-d'].map(inMill);
  const end = value(
    over(
      lines,
      Effect.flatMap(FeedDoor, (door) => door.lines.end()),
    ),
  )?.cursor;
  assert.ok(end !== undefined && end > 0);
  const first = value(over(lines, eventList({ limit: 1 })));
  assert.ok(first.metadata.continue !== undefined);
  assert.equal(first.metadata.resourceVersion, String(end));
  assert.equal(value(over(lines, eventList({}))).metadata.resourceVersion, String(end));
  assert.equal(value(over([], eventList({}))).metadata.resourceVersion, '0');
});

test('a token that is no cursor, a cursor inside a line, a bad limit and a bad selector are Invalid', () => {
  const lines = [inMill('r-1'), inMill('r-2')];
  assert.ok(failure(over(lines, eventList({ continue: 'not a token!' }))) instanceof Invalid);
  assert.ok(failure(over(lines, eventList({ continue: Buffer.from('r-1').toString('base64url') }))) instanceof Invalid);
  assert.ok(failure(over(lines, eventList({ continue: Buffer.from('3').toString('base64url') }))) instanceof Invalid);
  assert.ok(failure(over(lines, eventList({ limit: 0 }))) instanceof Invalid);
  assert.ok(failure(over(lines, eventList({ labelSelector: ['(('] }))) instanceof Invalid);
});

test("a label selector keeps the lines the feed's own selector takes", () => {
  const list = value(over([inMill('r-1'), v0, daemon], eventList({ labelSelector: ['kind=Daemon'] })));
  assert.deepEqual(
    list.items.map((e) => e.involved.kind),
    ['Daemon'],
  );
  const byFactory = value(over([inMill('r-1'), v0, daemon], eventList({ labelSelector: ['factory=mill'] })));
  assert.deepEqual(
    byFactory.items.map((e) => e.involved.name),
    ['r-1'],
  );
});

test("a namespace's list holds no daemon's line; every namespace's holds it, cluster-scoped", () => {
  const lines = [inMill('r-1'), daemon, v0];
  const mill = value(over(lines, eventList({ namespace: 'mill' })));
  assert.deepEqual(
    mill.items.map((e) => e.involved.name),
    ['r-1'],
  );
  const all = value(over(lines, eventList({})));
  const started = all.items.find((e) => e.involved.kind === 'Daemon');
  assert.ok(started !== undefined);
  assert.equal(decode(started).metadata.namespace, undefined);
  assert.equal(started.reason, 'DaemonStarted');
  assert.equal(started.source, 'daemon');
});

test('an Event is read by its name, under its namespace or none', () => {
  const lines = [inMill('r-1'), inMill('r-2')];
  const all = value(over(lines, eventList({})));
  const second = all.items[1];
  assert.ok(second !== undefined);
  assert.deepEqual(decode(value(over(lines, eventObject(second.metadata.name)))), second);
  assert.deepEqual(value(over(lines, eventObject(second.metadata.name, 'mill'))), second);
});

test('a name inside a line, past the feed, or no number is Missing', () => {
  const lines = [inMill('r-1'), inMill('r-2')];
  assert.ok(failure(over(lines, eventObject('3'))) instanceof Missing);
  assert.ok(failure(over(lines, eventObject('99999'))) instanceof Missing);
  assert.ok(failure(over(lines, eventObject('r-1'))) instanceof Missing);
  assert.ok(failure(over(lines, eventObject('-0'))) instanceof Missing);
  const end = value(over(lines, eventList({}))).items[1]?.metadata.resourceVersion;
  assert.ok(end !== undefined);
  assert.ok(failure(over(lines, eventObject(end))) instanceof Missing);
});

test('an Event read under another namespace, or a cluster-scoped one under any, is Missing', () => {
  const lines = [inMill('r-1'), daemon];
  assert.ok(failure(over(lines, eventObject('0', 'default'))) instanceof Missing);
  const started = value(over(lines, eventList({}))).items[1];
  assert.ok(started !== undefined);
  assert.ok(failure(over(lines, eventObject(started.metadata.name, 'mill'))) instanceof Missing);
  assert.equal(value(over(lines, eventObject(started.metadata.name))).involved.kind, 'Daemon');
});

test("an Event read by its byte on a large feed reads its own line, past a line nobody can read and a first chunk, and not the feed's rest", () => {
  const root = scratch('wf-event-one-');
  const big = { ...v1, message: 'x'.repeat(100 * 1024) };
  const rest = `${JSON.stringify(v1)}\n`.repeat(40_000);
  fs.writeFileSync(path.join(root, 'feed.jsonl'), `not a line of the feed\n${JSON.stringify(big)}\n${rest}`);
  const size = fs.statSync(path.join(root, 'feed.jsonl')).size;
  const { value: event, tallies } = Effect.runSync(meteredPass(eventObject('0')).pipe(Effect.provide(feedDoorFiles(root))));
  const end = Buffer.byteLength(`not a line of the feed\n${JSON.stringify(big)}\n`);
  assert.deepEqual(event, eventOf(big, 0, end), 'the line after the one nobody can read, named by where that one starts');
  const bytes = Object.values(tallies?.kinds ?? {}).reduce((sum, kind) => sum + kind.bytes, 0);
  assert.ok(bytes > Buffer.byteLength(JSON.stringify(big)), `its own line is read whole (${bytes} bytes)`);
  assert.ok(bytes < size / 4, `${bytes} bytes read of a feed of ${size}`);
});

test('a default page of a feed of 1,000 lines reads no more lines than the page and one past it, and reads on by continue', () => {
  const root = scratch('wf-event-page-');
  fs.writeFileSync(path.join(root, 'feed.jsonl'), Array.from({ length: 1000 }, (_, i) => `${JSON.stringify(inMill(`r-${i}`))}\n`).join(''));
  let read = 0;
  const files = feedFiles(root);
  const counted = Layer.succeed(FeedDoor)(
    feedDoorOver({
      lines: {
        ...files.lines,
        read: (after, limit) => {
          const lines = files.lines.read(after, limit);
          read += lines.lines.length;
          return lines;
        },
      },
    }),
  );
  const bounds = { byDefault: 10, most: 20 };
  const first = Effect.runSync(eventList({}, bounds).pipe(Effect.provide(counted)));
  assert.equal(first.items.length, 10);
  assert.ok(read <= 11, `${read} lines read for a page of 10`);
  const token = first.metadata.continue;
  assert.ok(token !== undefined);
  read = 0;
  const second = Effect.runSync(eventList({ continue: token, limit: 500 }, bounds).pipe(Effect.provide(counted)));
  assert.deepEqual(
    second.items.map((e) => e.involved.name),
    Array.from({ length: 20 }, (_, i) => `r-${i + 10}`),
    'a limit past the most answers the most',
  );
  assert.ok(read <= 21, `${read} lines read for a page of 20`);
  read = 0;
  const kept = Effect.runSync(eventList({ labelSelector: ['run=r-999'] }, bounds).pipe(Effect.provide(counted)));
  assert.deepEqual(
    kept.items.map((e) => e.involved.name),
    ['r-999'],
  );
  assert.equal(kept.metadata.remainingItemCount, 0);
  assert.equal(kept.metadata.continue, undefined);
});
