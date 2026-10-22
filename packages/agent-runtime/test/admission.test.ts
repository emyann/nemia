/**
 * The engine's ceiling: a pass admits the tasks filed `queued` while their pool has room, the highest `priority` first, then the
 * earliest filed, then the lower id, and the pass after it starts them. Each order is proven by a fixture listed in the opposite
 * one, and each pool by a fixture that shares or splits it.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Event, FeedEntry, HarnessConfig, Sighting } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { nameFor } from '../src/core/domain.ts';
import { holdsSlot, ownPool, toAdmit, type AdmissionView } from '../src/core/admission.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { scratch } from './scratch.ts';

const memoryJournal = (): AsyncJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

/** A harness whose sessions work until the test says otherwise. */
const fake = (sessions: Map<string, Sighting>): AsyncRunner => ({
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
  },
  async observe() {
    return new Map(sessions);
  },
  async stop() {},
  async logs() {
    return '';
  },
});

/** A board of harnesses `a` and `b`, each pooled as `pools` says, under `maxConcurrent`. */
const board = (maxConcurrent: number | undefined, pools: { a?: string; b?: string } = {}, journal = memoryJournal()) => {
  const sessions = new Map<string, Sighting>();
  const harnesses: Record<string, HarnessConfig> = {
    a: { ...asyncOps(fake(sessions)), ...(pools.a ? { pool: pools.a } : {}) },
    b: { ...asyncOps(fake(sessions)), ...(pools.b ? { pool: pools.b } : {}) },
  };
  const engine = builtEngine(
    Engine.layer({ root: scratch('ae-admission-root-'), journal: asyncStore(journal), harnesses, defaultHarness: 'a', ...(maxConcurrent ? { maxConcurrent } : {}) }),
  );
  return { engine, sessions, journal };
};

/** File `id` queued on `harness` as of `at`, with `priority` when given: the entry `file` writes, at a time the test chooses. */
const fileAt = (journal: AsyncJournal, id: string, at: string, harness = 'a', priority?: number) =>
  journal.append(id, { kind: 'filed', at, brief: id, cwd: '/r', harness, queued: true, ...(priority !== undefined ? { priority } : {}) });

const started = (sessions: Map<string, Sighting>) => [...sessions.keys()].sort();

test('under a ceiling of 1, the queued task of the highest priority is admitted, wherever it is listed and whenever filed', async () => {
  const b = board(1);
  await fileAt(b.journal, 'x', '2026-10-04T09:00:00.000Z', 'a', 0);
  await fileAt(b.journal, 'y', '2026-10-04T09:00:02.000Z', 'a', 1);
  await fileAt(b.journal, 'z', '2026-10-04T09:00:01.000Z', 'a', 0);
  const first = await Effect.runPromise(b.engine.tick());
  assert.deepEqual(
    first.views.map((v) => [v.id, v.admission]),
    [
      ['x', 'queued'],
      ['y', 'admitted'],
      ['z', 'queued'],
    ],
    'the pass admits `y`, filed last and listed between two of priority 0',
  );
  assert.equal(b.sessions.size, 0, 'admitted on this pass, started on none');
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(started(b.sessions), [nameFor('y', 1)], 'the next pass starts it');
});

test('of one priority, the earliest filed is admitted, against the order the store lists them in', async () => {
  const b = board(1);
  await fileAt(b.journal, 'a1', '2026-10-04T09:00:02.000Z');
  await fileAt(b.journal, 'a2', '2026-10-04T09:00:01.000Z');
  await fileAt(b.journal, 'a3', '2026-10-04T09:00:00.000Z');
  await Effect.runPromise(b.engine.tick());
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(started(b.sessions), [nameFor('a3', 1)]);
});

test('two harnesses sharing a pool share its ceiling: one at work holds the other back, and apart each is admitted', async () => {
  const shared = board(1, { a: 'x', b: 'x' });
  await fileAt(shared.journal, 'on-b', '2026-10-04T09:00:00.000Z', 'b');
  await Effect.runPromise(shared.engine.tick());
  await Effect.runPromise(shared.engine.tick());
  assert.deepEqual(started(shared.sessions), [nameFor('on-b', 1)], '`on-b` at work');
  await fileAt(shared.journal, 'on-a', '2026-10-04T09:00:01.000Z', 'a');
  const held = await Effect.runPromise(shared.engine.tick());
  assert.equal(held.views.find((v) => v.id === 'on-a')?.admission, 'queued', "`on-a` waits: its pool's one slot is held");

  const apart = board(1, { a: 'x' });
  await fileAt(apart.journal, 'on-b', '2026-10-04T09:00:00.000Z', 'b');
  await Effect.runPromise(apart.engine.tick());
  await Effect.runPromise(apart.engine.tick());
  await fileAt(apart.journal, 'on-a', '2026-10-04T09:00:01.000Z', 'a');
  const admitted = await Effect.runPromise(apart.engine.tick());
  assert.equal(admitted.views.find((v) => v.id === 'on-a')?.admission, 'admitted', "with `b`'s pool its own, `on-a` is admitted");
});

test('with no ceiling the pass admits nothing: a queued task waits for `admit`, as ever', async () => {
  const b = board(undefined);
  await fileAt(b.journal, 'q', '2026-10-04T09:00:00.000Z');
  for (let i = 0; i < 3; i++) await Effect.runPromise(b.engine.tick());
  assert.equal(b.sessions.size, 0);
  assert.equal((await Effect.runPromise(b.engine.view('q'))).admission, 'queued');
  await Effect.runPromise(b.engine.admit(['q']));
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(started(b.sessions), [nameFor('q', 1)]);
});

test('the order is the journal’s: an engine that never saw the filing admits by the priority it reads back', async () => {
  const journal = memoryJournal();
  await fileAt(journal, 'low', '2026-10-04T09:00:00.000Z', 'a', 0);
  await fileAt(journal, 'high', '2026-10-04T09:00:01.000Z', 'a', 7);
  const after = board(1, {}, journal);
  await Effect.runPromise(after.engine.tick());
  await Effect.runPromise(after.engine.tick());
  assert.deepEqual(started(after.sessions), [nameFor('high', 1)]);
});

const T0 = Date.parse('2026-10-04T10:00:00.000Z');
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const queued = (id: string, filed: number, harness = 'a', priority?: number): AdmissionView => ({
  id,
  phase: 'pending',
  admission: 'queued',
  state: { harness, filedAt: at(filed), ...(priority !== undefined ? { priority } : {}) },
});
const live = (id: string, phase: string, harness = 'a'): AdmissionView => ({ id, phase, state: { harness, filedAt: at(0) } });
const under = (ceiling: number, poolOf = ownPool) => ({ ceiling, poolOf });
const sharing = (harness: string | undefined) => (harness === 'b' ? 'a' : ownPool(harness));

test('holdsSlot: a session at work, one starting, and one admitted and not yet started hold a slot; one blocked, held, between attempts or settled none', () => {
  for (const phase of ['running (working)', 'working (quiescent)', 'starting']) assert.equal(holdsSlot({ phase }), true, phase);
  assert.equal(holdsSlot({ phase: 'pending', admission: 'admitted' }), true);
  assert.equal(holdsSlot({ phase: 'pending', admission: 'queued' }), false);
  assert.equal(holdsSlot({ phase: 'pending' }), false);
  for (const phase of ['needs-human', 'input-required', 'between attempts', 'succeeded', 'failed', 'stopped'])
    assert.equal(holdsSlot({ phase }), false, phase);
});

test('toAdmit: a harness that shares a pool counts against its ceiling, listed first so a pool by harness name alone reads two', () => {
  const views = [live('b-1', 'running (working)', 'b'), live('a-1', 'running (working)'), queued('a-2', 1), queued('b-2', 2, 'b')];
  assert.deepEqual(toAdmit(views, under(2, sharing)), []);
  assert.deepEqual(toAdmit(views, under(3, sharing)), ['a-2']);
  assert.deepEqual(toAdmit(views, under(2)), ['a-2', 'b-2'], 'each its own pool');
});

test('toAdmit: the ceiling is counted per pool, and a task with no harness counts in `default`', () => {
  const views = [
    live('x-1', 'running (working)', 'x'),
    live('x-2', 'running (working)', 'x'),
    live('k-1', 'running (working)', 'k'),
    queued('a-1', 1),
    queued('x-3', 2, 'x'),
    queued('k-2', 3, 'k'),
    queued('k-3', 4, 'k'),
    queued('f-1', 5, 'f'),
  ];
  assert.deepEqual(toAdmit(views, under(2)), ['a-1', 'k-2', 'f-1']);
  const bare = (id: string, admission?: 'queued'): AdmissionView => ({
    id,
    phase: admission ? 'pending' : 'running (working)',
    ...(admission ? { admission } : {}),
    state: {},
  });
  assert.deepEqual(toAdmit([bare('d-1'), bare('d-2', 'queued'), queued('def', 1, 'default')], under(1)), [], '`default` is full');
  assert.deepEqual(toAdmit([bare('d-1'), queued('a-1', 1)], under(1)), ['a-1']);
});

test('toAdmit: each task admitted is counted at once, a full pool admits nothing more, and it drains one for one', () => {
  const waiting = [queued('a-1', 1), queued('a-2', 2), queued('a-3', 3)];
  assert.deepEqual(toAdmit(waiting, under(2)), ['a-1', 'a-2']);
  const next = [{ ...waiting[0], admission: 'admitted' as const }, { ...waiting[1], admission: 'admitted' as const }, waiting[2]];
  assert.deepEqual(toAdmit(next, under(2)), [], 'the pass after: those two hold their slots');
  assert.deepEqual(toAdmit([next[0], next[2]], under(2)), ['a-3'], 'one ended: exactly one more');
});

test('toAdmit: a session blocked on a person holds no slot, and counts again once it works again', () => {
  assert.deepEqual(toAdmit([live('a-1', 'needs-human'), live('a-2', 'input-required'), queued('a-3', 1)], under(1)), ['a-3']);
  assert.deepEqual(toAdmit([live('a-1', 'running (working)'), live('a-2', 'input-required'), queued('a-3', 1)], under(1)), []);
});

test('toAdmit: the higher priority first, then the earlier filing, then the lower id, each against the order it is given in', () => {
  assert.deepEqual(toAdmit([queued('first', 1, 'a', 0), queued('after', 9, 'a', 1)], under(1)), ['after'], 'priority over the filing');
  assert.deepEqual(toAdmit([queued('first', 1), queued('after', 9)], under(1)), ['first'], 'with none, filing order');
  assert.deepEqual(toAdmit([queued('low', 1, 'a', -1), queued('none', 2)], under(1)), ['none'], 'no priority is 0, above -1');
  assert.deepEqual(toAdmit([queued('a-a', 20), queued('a-b', 10)], under(1)), ['a-b'], 'the later id filed first');
  assert.deepEqual(toAdmit([queued('a-b', 5), queued('a-a', 5)], under(1)), ['a-a']);
  assert.deepEqual(toAdmit([queued('a-a', 5), queued('a-b', 5)], under(1)), ['a-a']);
  const garbled = { ...queued('a-a', 0), state: { harness: 'a', filedAt: 'garbage' } };
  assert.deepEqual(toAdmit([garbled, queued('a-b', 50)], under(1)), ['a-b'], 'a time that does not parse goes last');
});

test('toAdmit: no ceiling admits nothing, and a task admitted or not queued is never admitted again', () => {
  assert.deepEqual(toAdmit([queued('w', 1)], { poolOf: ownPool }), []);
  assert.deepEqual(
    toAdmit(
      [
        { ...queued('a-1', 1), admission: 'admitted' as const },
        { ...queued('a-2', 2), admission: undefined },
      ],
      under(5),
    ),
    [],
  );
});

test('toAdmit: a rule unschedulable admits nothing while it says so, and admits again once it does not, asked each time', () => {
  const waiting = [queued('a-1', 1), queued('a-2', 2)];
  let unschedulable = true;
  const rule = { ...under(2), unschedulable: () => unschedulable };
  assert.deepEqual(toAdmit(waiting, rule), [], 'unschedulable: nothing admitted, though the pool has room');
  unschedulable = false;
  assert.deepEqual(toAdmit(waiting, rule), ['a-1', 'a-2'], 'schedulable again: the same rule admits as a ceiling does');
});

test('an engine unschedulable admits no queued task on any pass while it says so; what works goes on, and `admit` still admits', async () => {
  const journal = memoryJournal();
  const sessions = new Map<string, Sighting>();
  let unschedulable = false;
  const harnesses: Record<string, HarnessConfig> = { a: asyncOps(fake(sessions)) };
  const engine = builtEngine(
    Engine.layer({ root: scratch('ae-admission-root-'), journal: asyncStore(journal), harnesses, defaultHarness: 'a', maxConcurrent: 3, unschedulable: () => unschedulable }),
  );
  await fileAt(journal, 'before', '2026-10-04T09:00:00.000Z');
  await Effect.runPromise(engine.tick());
  unschedulable = true;
  await fileAt(journal, 'held', '2026-10-04T09:00:01.000Z');
  for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
  assert.deepEqual(started(sessions), [nameFor('before', 1)], 'admitted before, it starts; filed after, it waits');
  assert.equal((await Effect.runPromise(engine.view('held'))).admission, 'queued');
  await fileAt(journal, 'named', '2026-10-04T09:00:02.000Z');
  await Effect.runPromise(engine.admit(['named']));
  await Effect.runPromise(engine.tick());
  assert.deepEqual(started(sessions), [nameFor('before', 1), nameFor('named', 1)], 'a task `admit` names starts all the same');
  unschedulable = false;
  await Effect.runPromise(engine.tick());
  await Effect.runPromise(engine.tick());
  assert.deepEqual(started(sessions), [nameFor('before', 1), nameFor('held', 1), nameFor('named', 1)], 'the flag down, it is admitted');
});

test('REFUSED at shipped defaults: an `unschedulable` that is not a function builds no engine', () => {
  assert.throws(
    () => builtEngine(Engine.layer({ journal: memoryJournal(), unschedulable: true } as never)),
    (err: Error) => err.message.includes('`unschedulable` is a function, `() => boolean`, asked on every pass'),
  );
});
