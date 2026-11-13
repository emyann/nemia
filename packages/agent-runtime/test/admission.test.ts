/**
 * The engine's ceiling: a pass admits the tasks filed `queued` while their pool has room, the highest `priority` first, then the
 * earliest filed, then the lower id, and the pass after it starts them. Each order is proven by a fixture listed in the opposite
 * one, and each pool by a fixture that shares or splits it.
 */
import { Effect, Layer } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Event, FeedEntry, HarnessConfig, Sighting, SpawnRequest, TaskPhase, TaskView } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { nameFor } from '../src/core/domain.ts';
import { Journal } from '../src/core/engine/journal.ts';
import { Runner } from '../src/harness/seam.ts';
import { file } from '../src/core/engine/filing.ts';
import { Admission, tick, view } from '../src/core/engine/engine.ts';
import { tickMemoLayer } from '../src/core/engine/memo.ts';
import {
  admitting,
  holdsSlot,
  ownPool,
  roomOf,
  toAdmit,
  type AdmissionPass,
  type AdmissionRule,
  type AdmissionView,
  type AdmissionWait,
  type Admitted,
  type Holder,
  type MachineMemory,
  type Waiter,
} from '../src/core/admission.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';

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
    Engine.layer({
      root: scratch('ae-admission-root-'),
      journal: asyncStore(journal),
      harnesses,
      defaultHarness: 'a',
      ...(maxConcurrent ? { maxConcurrent } : {}),
    }),
  );
  return { engine, sessions, journal };
};

/** File `id` queued on `harness` as of `at`, with `priority` when given: the entry `file` writes, at a time the test chooses. */
const fileAt = (journal: AsyncJournal, id: string, at: string, harness = 'a', priority?: number) =>
  journal.append(id, { kind: 'filed', at, brief: id, cwd: '/r', harness, queued: true, ...(priority !== undefined ? { priority } : {}) });

const started = (sessions: Map<string, Sighting>) => [...sessions.keys()].sort();

test('under a ceiling of 1, the queue drains by priority, then by filing, against the order the store lists it in, two harnesses sharing one pool — read off the journal by an engine that never saw the filings', async (t) => {
  const s = story(t);
  const journal = memoryJournal();
  await fileAt(journal, 'x', '2026-10-04T09:00:02.000Z', 'a', 0);
  await fileAt(journal, 'y', '2026-10-04T09:00:03.000Z', 'a', 1);
  await fileAt(journal, 'z', '2026-10-04T09:00:01.000Z', 'a', 0);
  const b = board(1, { a: 'x', b: 'x' }, journal);

  await s.test('the queued task of the highest priority is admitted, wherever it is listed and whenever filed', async () => {
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
  });

  await s.test('the next pass starts it', async () => {
    await Effect.runPromise(b.engine.tick());
    assert.deepEqual(started(b.sessions), [nameFor('y', 1)], 'the next pass starts it');
  });

  await s.test("a harness sharing the pool is held back by the one at work: its pool's one slot is held", async () => {
    await fileAt(b.journal, 'on-b', '2026-10-04T09:00:00.000Z', 'b');
    const held = await Effect.runPromise(b.engine.tick());
    assert.equal(held.views.find((v) => v.id === 'on-b')?.admission, 'queued', "`on-b` waits: its pool's one slot is held");
  });

  await s.test('the slot let go, the earliest filed of one priority is admitted, whichever harness of the pool it is on', async () => {
    b.sessions.set(nameFor('y', 1), { ...b.sessions.get(nameFor('y', 1))!, state: 'completed' });
    await Effect.runPromise(b.engine.tick());
    await Effect.runPromise(b.engine.tick());
    assert.deepEqual(
      started(b.sessions),
      [nameFor('on-b', 1), nameFor('y', 1)],
      '`on-b`, filed first of priority 0 and listed first, is admitted',
    );
  });

  await s.test('and after it the earliest filed of the rest, against the order the store lists them in', async () => {
    b.sessions.set(nameFor('on-b', 1), { ...b.sessions.get(nameFor('on-b', 1))!, state: 'completed' });
    await Effect.runPromise(b.engine.tick());
    await Effect.runPromise(b.engine.tick());
    assert.deepEqual(
      started(b.sessions),
      [nameFor('on-b', 1), nameFor('y', 1), nameFor('z', 1)],
      '`z`, filed before `x` and listed after it',
    );
  });
});

test('the engine admits by its ceiling and pools alone: a pool its own admits apart, no ceiling admits nothing, and an engine unschedulable admits nothing while it says so', async (t) => {
  await t.test("with `b`'s pool its own, a task on `a` is admitted while `b` is at work", async () => {
    const apart = board(1, { a: 'x' });
    await fileAt(apart.journal, 'on-b', '2026-10-04T09:00:00.000Z', 'b');
    await Effect.runPromise(apart.engine.tick());
    await Effect.runPromise(apart.engine.tick());
    await fileAt(apart.journal, 'on-a', '2026-10-04T09:00:01.000Z', 'a');
    const admitted = await Effect.runPromise(apart.engine.tick());
    assert.equal(admitted.views.find((v) => v.id === 'on-a')?.admission, 'admitted', "with `b`'s pool its own, `on-a` is admitted");
  });

  await t.test('with no ceiling the pass admits nothing: a queued task waits for `admit`, as ever', async () => {
    const b = board(undefined);
    await fileAt(b.journal, 'q', '2026-10-04T09:00:00.000Z');
    for (let i = 0; i < 3; i++) await Effect.runPromise(b.engine.tick());
    assert.equal(b.sessions.size, 0);
    assert.equal((await Effect.runPromise(b.engine.view('q'))).admission, 'queued');
    await Effect.runPromise(b.engine.admit(['q']));
    await Effect.runPromise(b.engine.tick());
    assert.deepEqual(started(b.sessions), [nameFor('q', 1)]);
  });

  await t.test(
    'an engine unschedulable admits no queued task on any pass while it says so; what works goes on, and `admit` still admits',
    async () => {
      const journal = memoryJournal();
      const sessions = new Map<string, Sighting>();
      let unschedulable = false;
      const harnesses: Record<string, HarnessConfig> = { a: asyncOps(fake(sessions)) };
      const engine = builtEngine(
        Engine.layer({
          root: scratch('ae-admission-root-'),
          journal: asyncStore(journal),
          harnesses,
          defaultHarness: 'a',
          maxConcurrent: 3,
          unschedulable: () => unschedulable,
        }),
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
    },
  );
});

const GI = 2 ** 30;
const MI = 2 ** 20;

/**
 * A board of harnesses `a` (pool `claude`) and `checks` under a ceiling of 6, whose machine is what `machine` says on each pass, and
 * which keeps `reserved` off it when given.
 */
const machineBoard = (
  reserved: string | undefined,
  machine: { totalBytes: number; availableBytes: number },
  maxConcurrent = 6,
  unschedulable?: () => boolean,
) => {
  const journal = memoryJournal();
  const sessions = new Map<string, Sighting>();
  const harnesses: Record<string, HarnessConfig> = {
    a: { ...asyncOps(fake(sessions)), pool: 'claude' },
    checks: asyncOps(fake(sessions)),
  };
  const engine = builtEngine(
    Engine.layer({
      root: scratch('ae-admission-root-'),
      journal: asyncStore(journal),
      harnesses,
      defaultHarness: 'a',
      maxConcurrent,
      ...(reserved ? { reserved: { memory: reserved } } : {}),
      machine: () => ({ ...machine }),
      ...(unschedulable ? { unschedulable } : {}),
    }),
  );
  return { engine, sessions, journal };
};

/** File `id` queued on `harness`, limited to `limit`, `filed` seconds into the board's day. */
const fileLimited = (journal: AsyncJournal, id: string, filed: number, harness: string, limit: string) =>
  journal.append(id, {
    kind: 'filed',
    at: new Date(Date.parse('2026-10-04T09:00:00.000Z') + filed * 1000).toISOString(),
    brief: id,
    cwd: '/r',
    harness,
    queued: true,
    resources: { limits: { memory: limit } },
  });

/** The admission each view says, by id. */
const admissions = (views: readonly TaskView[]) => Object.fromEntries(views.map((v) => [v.id, v.admission]));

test("admission by the machine's memory: on 11Gi available, 1Gi kept, tasks of a 3Gi limit across a session's pool and the checks' are admitted floor(10 / 3) = 3, the fourth's view says it waits for memory, and once the three run and the machine has room it is admitted", async (t) => {
  const s = story(t);
  const machine = { totalBytes: 16 * GI, availableBytes: 11 * GI };
  const b = machineBoard('1Gi', machine);
  await fileLimited(b.journal, 'one', 1, 'a', '3Gi');
  await fileLimited(b.journal, 'two', 2, 'checks', '3Gi');
  await fileLimited(b.journal, 'three', 3, 'a', '3Gi');
  await fileLimited(b.journal, 'four', 4, 'checks', '3Gi');

  await s.test('one pass admits three, in turn, across both pools: the ceiling of 6 had room for all four', async () => {
    const pass = await Effect.runPromise(b.engine.tick());
    assert.deepEqual(admissions(pass.views), { one: 'admitted', two: 'admitted', three: 'admitted', four: 'queued' });
  });

  await s.test("the fourth's view says it waits for memory: its need, 3Gi, and the room left, 1Gi", async () => {
    const view = await Effect.runPromise(b.engine.view('four'));
    assert.deepEqual(view.waits, { for: 'memory', needBytes: 3 * GI, roomBytes: GI });
    for (const id of ['one', 'two', 'three']) assert.equal((await Effect.runPromise(b.engine.view(id))).waits, undefined, id);
  });

  await s.test('the next pass starts the three, and still has no room: what they asked is not yet in what the kernel shows', async () => {
    const pass = await Effect.runPromise(b.engine.tick());
    assert.deepEqual(started(b.sessions), [nameFor('one', 1), nameFor('three', 1), nameFor('two', 1)]);
    assert.equal(pass.views.find((v) => v.id === 'four')?.admission, 'queued');
  });

  await s.test(
    'the three at work on a machine with 3Gi available now: the live reading keeps the fourth waiting, its room 2Gi',
    async () => {
      machine.availableBytes = 3 * GI;
      const pass = await Effect.runPromise(b.engine.tick());
      assert.deepEqual(pass.views.find((v) => v.id === 'four')?.waits, { for: 'memory', needBytes: 3 * GI, roomBytes: 2 * GI });
      assert.deepEqual((await Effect.runPromise(b.engine.view('four'))).waits, { for: 'memory', needBytes: 3 * GI, roomBytes: 2 * GI });
    },
  );

  await s.test(
    'with 8Gi available, the requests fit the total (9Gi + 3Gi of 15Gi) and the newcomer what is free: it is admitted, its wait gone',
    async () => {
      machine.availableBytes = 8 * GI;
      const pass = await Effect.runPromise(b.engine.tick());
      const four = pass.views.find((v) => v.id === 'four');
      assert.equal(four?.admission, 'admitted');
      assert.equal(four?.waits, undefined);
      assert.equal((await Effect.runPromise(b.engine.view('four'))).waits, undefined);
    },
  );
});

test("admission with no reserve given reads no machine: the ceiling alone admits, and a task its pool's ceiling holds says it waits for a slot", async (t) => {
  await t.test('no reserve: all four of a 3Gi limit are admitted on a machine of 11Gi available', async () => {
    const b = machineBoard(undefined, { totalBytes: 16 * GI, availableBytes: 11 * GI });
    for (const [i, id] of ['one', 'two', 'three', 'four'].entries()) await fileLimited(b.journal, id, i, i % 2 ? 'checks' : 'a', '3Gi');
    const pass = await Effect.runPromise(b.engine.tick());
    assert.deepEqual(admissions(pass.views), { one: 'admitted', two: 'admitted', three: 'admitted', four: 'admitted' });
  });

  await t.test(
    "a ceiling of 1: the second of a pool waits for a slot, naming its pool and the ceiling, the other pool's admitted",
    async () => {
      const b = machineBoard('1Gi', { totalBytes: 16 * GI, availableBytes: 11 * GI }, 1);
      await fileLimited(b.journal, 'first', 1, 'a', '1Gi');
      await fileLimited(b.journal, 'second', 2, 'a', '1Gi');
      await fileLimited(b.journal, 'check', 3, 'checks', '1Gi');
      const pass = await Effect.runPromise(b.engine.tick());
      assert.deepEqual(admissions(pass.views), { first: 'admitted', second: 'queued', check: 'admitted' });
      assert.deepEqual((await Effect.runPromise(b.engine.view('second'))).waits, { for: 'slot', pool: 'claude', ceiling: 1 });
    },
  );

  await t.test('a machine that answers no reading admits by the ceiling alone, that pass', async () => {
    const journal = memoryJournal();
    const sessions = new Map<string, Sighting>();
    const engine = builtEngine(
      Engine.layer({
        root: scratch('ae-admission-root-'),
        journal: asyncStore(journal),
        harnesses: { a: asyncOps(fake(sessions)) },
        defaultHarness: 'a',
        maxConcurrent: 6,
        reserved: { memory: '1Gi' },
        machine: () => undefined,
      }),
    );
    await fileLimited(journal, 'big', 1, 'a', '64Gi');
    const pass = await Effect.runPromise(engine.tick());
    assert.equal(pass.views.find((v) => v.id === 'big')?.admission, 'admitted');
  });
});

test('a wait is journalled only when it changes by a grain: passes on a machine whose room moves under 256 MiB write one `waits` entry', async () => {
  const machine = { totalBytes: 16 * GI, availableBytes: 3 * GI };
  const b = machineBoard('1Gi', machine);
  await fileLimited(b.journal, 'big', 1, 'a', '4Gi');
  for (const mib of [0, 10, 100, 200]) {
    machine.availableBytes = 3 * GI + mib * 2 ** 20;
    await Effect.runPromise(b.engine.tick());
  }
  const waits = (await b.journal.read('big')).filter((e) => e.kind === 'waits');
  assert.equal(waits.length, 1, 'one entry for four passes inside one grain');
  machine.availableBytes = 4 * GI;
  await Effect.runPromise(b.engine.tick());
  assert.equal((await b.journal.read('big')).filter((e) => e.kind === 'waits').length, 2, 'a grain moved: a second');
});

test('a pass that judges nothing takes a recorded wait off: while the engine is unschedulable, a task waiting for memory says no reason it no longer has', async () => {
  const machine = { totalBytes: 16 * GI, availableBytes: 3 * GI };
  let paused = false;
  const b = machineBoard('1Gi', machine, 6, () => paused);
  await fileLimited(b.journal, 'big', 1, 'a', '4Gi');
  await Effect.runPromise(b.engine.tick());
  assert.equal((await Effect.runPromise(b.engine.view('big'))).waits?.for, 'memory', 'judged: it waits for memory');
  paused = true;
  const pass = await Effect.runPromise(b.engine.tick());
  assert.equal(pass.views.find((v) => v.id === 'big')?.waits, undefined, 'the pass judged nothing: its view says no wait');
  assert.equal((await Effect.runPromise(b.engine.view('big'))).waits, undefined, 'nor does the record');
  assert.equal((await Effect.runPromise(b.engine.view('big'))).admission, 'queued', 'still queued');
  const cleared = (await b.journal.read('big')).filter((e) => e.kind === 'waits').length;
  await Effect.runPromise(b.engine.tick());
  assert.equal((await b.journal.read('big')).filter((e) => e.kind === 'waits').length, cleared, 'taken off once, never again while paused');
  paused = false;
  await Effect.runPromise(b.engine.tick());
  assert.equal((await Effect.runPromise(b.engine.view('big'))).waits?.for, 'memory', 'judged again: the wait is back');
});

test('the memory gate under a memo that verifies every task it skips: a pass that journals a wait and an admission skips no change', async () => {
  const machine = { totalBytes: 16 * GI, availableBytes: 6 * GI, reservedBytes: GI };
  const sessions = new Map<string, Sighting>();
  const layer = Layer.mergeAll(
    Journal.test(),
    Runner.test({ sessions }),
    tickMemoLayer({ verify: true }),
    Layer.succeed(Admission)({ ceiling: 6, poolOf: ownPool, machine: () => ({ ...machine }) }),
  );
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  for (const id of ['p', 'q', 'r'])
    await run(file({ id, brief: id, cwd: '/r', queued: true, resources: { limits: { memory: '4Gi' }, requests: { memory: '2Gi' } } }));
  const first = await run(tick());
  assert.deepEqual(
    admissions(first.views),
    { p: 'admitted', q: 'admitted', r: 'queued' },
    'counted at its 2Gi request, not its 4Gi limit: 5Gi of room, two of three',
  );
  assert.deepEqual(first.views.find((v) => v.id === 'r')?.waits, { for: 'memory', needBytes: 2 * GI, roomBytes: GI });
  for (let i = 0; i < 3; i++) await run(tick());
  machine.availableBytes = 12 * GI;
  await run(tick());
  const last = await run(tick());
  assert.equal(last.views.find((v) => v.id === 'r')?.waits, undefined);
  assert.equal((await run(view('r', new Map()))).waits, undefined, 'admitted or started: no wait on record');
});

/**
 * An engine over `journal` and `machine` whose sessions are `sessions`, holding `defaults` as its default limit and request: the
 * daemon as one unit sets it, a resize being another engine on the same store. Each spawn request its harness is asked is kept.
 */
const resizedBoard = (
  journal: AsyncJournal,
  sessions: Map<string, Sighting>,
  machine: { totalBytes: number; availableBytes: number },
  defaults: { limit: string; request?: string },
) => {
  const asked: SpawnRequest[] = [];
  const runner = fake(sessions);
  const engine = builtEngine(
    Engine.layer({
      root: scratch('ae-admission-root-'),
      journal: asyncStore(journal),
      harnesses: { a: asyncOps({ ...runner, spawn: async (r) => (asked.push(r), runner.spawn(r)) }) },
      defaultHarness: 'a',
      maxConcurrent: 5,
      reserved: { memory: '1Gi' },
      machine: () => ({ ...machine }),
      defaultLimits: { memory: defaults.limit },
      ...(defaults.request ? { defaultRequests: { memory: defaults.request } } : {}),
    }),
  );
  return { engine, asked };
};

test("a task queued under one default and admitted under a smaller one counts at the smaller: the engine's defaults land on a task with none of its own as its attempt starts, as a LimitRange's on a Pod when it is created, and a session already started keeps its own", async (t) => {
  const s = story(t);
  const journal = memoryJournal();
  const sessions = new Map<string, Sighting>();
  const machine = { totalBytes: 16 * GI, availableBytes: 6 * GI };
  const before = resizedBoard(journal, sessions, machine, { limit: '8Gi' });
  const after = resizedBoard(journal, sessions, machine, { limit: '8Gi', request: '2560Mi' });
  const id = await Effect.runPromise(before.engine.file({ brief: 'land', cwd: '/r', queued: true }));

  await s.test('filed under an 8Gi default and no request, it waits for memory counted at 8Gi, and its filing carries no resources', async () => {
    const pass = await Effect.runPromise(before.engine.tick());
    assert.deepEqual(pass.views.find((v) => v.id === id)?.waits, { for: 'memory', needBytes: 8 * GI, roomBytes: 5 * GI });
    assert.equal((await journal.read(id)).find((e) => e.kind === 'filed')?.resources, undefined);
    assert.equal((await Effect.runPromise(before.engine.view(id))).state.resources, undefined);
  });

  await s.test('the engine resized to a 2560Mi default request: the same queued task now says it needs 2560Mi', async () => {
    machine.availableBytes = 3 * GI;
    const pass = await Effect.runPromise(after.engine.tick());
    assert.deepEqual(pass.views.find((v) => v.id === id)?.waits, { for: 'memory', needBytes: 2560 * MI, roomBytes: 2 * GI });
  });

  await s.test('with the room an 8Gi count never had, it is admitted at 2560Mi', async () => {
    machine.availableBytes = 6 * GI;
    const pass = await Effect.runPromise(after.engine.tick());
    assert.equal(pass.views.find((v) => v.id === id)?.admission, 'admitted');
  });

  await s.test('it starts under the defaults in force then: its `starting` entry, its attempt and its spawn request say the same', async () => {
    await Effect.runPromise(after.engine.tick());
    const resized = { limits: { memory: '8Gi' }, requests: { memory: '2560Mi' } };
    assert.deepEqual((await journal.read(id)).find((e) => e.kind === 'starting')?.resources, resized);
    assert.deepEqual((await Effect.runPromise(after.engine.view(id))).state.attempts[0]?.resources, resized);
    assert.deepEqual(
      after.asked.map((r) => r.resources),
      [resized],
    );
  });

  await s.test(
    'resized again to a 6Gi request, the running session is still counted at the 2560Mi it started under: a 10Gi task of its own fits the 12.5Gi that leaves, where 9Gi would not hold it',
    async () => {
      machine.availableBytes = 14 * GI;
      const again = resizedBoard(journal, sessions, machine, { limit: '8Gi', request: '6Gi' });
      const big = await Effect.runPromise(again.engine.file({ brief: 'big', cwd: '/r', queued: true, resources: { limits: { memory: '10Gi' } } }));
      const pass = await Effect.runPromise(again.engine.tick());
      assert.equal(pass.views.find((v) => v.id === big)?.admission, 'admitted');
      assert.deepEqual((await Effect.runPromise(again.engine.view(big))).state.resources, { limits: { memory: '10Gi' } }, 'its own kept');
    },
  );
});

const T0 = Date.parse('2026-10-04T10:00:00.000Z');
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const queued = (id: string, filed: number, harness = 'a', priority?: number): AdmissionView => ({
  id,
  phase: 'pending',
  admission: 'queued',
  state: { harness, filedAt: at(filed), ...(priority !== undefined ? { priority } : {}) },
});
const live = (id: string, phase: TaskPhase, harness = 'a'): AdmissionView => ({ id, phase, state: { harness, filedAt: at(0) } });
const under = (ceiling: number, poolOf = ownPool) => ({ ceiling, poolOf });
/** The ids `toAdmit` admits, in turn. */
const admittedIds = (views: readonly AdmissionView[], rule: AdmissionRule) => toAdmit(views, rule).admit;
const sharing = (harness: string | undefined) => (harness === 'b' ? 'a' : ownPool(harness));

test('toAdmit and holdsSlot: which queued tasks a pass admits — per pool, by priority, filing and id, counted at once — and which views hold a slot', async (t) => {
  await t.test(
    'holdsSlot: a session at work or quiescent, one starting, and one admitted and not yet started hold a slot; one waiting on a person, held, idle, restarting, between attempts, ending or settled none',
    () => {
      for (const phase of ['working', 'quiescent', 'starting'] as const) assert.equal(holdsSlot({ phase }), true, phase);
      assert.equal(holdsSlot({ phase: 'pending', admission: 'admitted' }), true);
      assert.equal(holdsSlot({ phase: 'pending', admission: 'queued' }), false);
      assert.equal(holdsSlot({ phase: 'pending' }), false);
      for (const phase of [
        'needs-human',
        'input-required',
        'idle',
        'restarting',
        'between-attempts',
        'ending',
        'succeeded',
        'failed',
        'stopped',
      ] as const)
        assert.equal(holdsSlot({ phase }), false, phase);
    },
  );
  await t.test(
    'a task counts at what it runs under: one with none of its own at the defaults the rule holds now, one with its own at them whatever the defaults, a started attempt at what it recorded, and an attempt an older runtime started at its filing',
    () => {
      const room = { totalBytes: 16 * GI, availableBytes: 16 * GI, reservedBytes: 15 * GI };
      const rule: AdmissionRule = {
        ceiling: 5,
        poolOf: ownPool,
        machine: () => room,
        defaultsOf: () => ({ limits: { memory: '4Gi' }, requests: { memory: '2Gi' } }),
      };
      const waitOf = (view: AdmissionView, holders: AdmissionView[] = []) =>
        toAdmit([...holders, view], rule).waits.find((w) => w.id === view.id)?.wait;
      assert.deepEqual(waitOf(queued('bare', 1)), { for: 'memory', needBytes: 2 * GI, roomBytes: GI });
      const own = queued('own', 1);
      assert.deepEqual(waitOf({ ...own, state: { ...own.state, resources: { limits: { memory: '3Gi' } } } }), {
        for: 'memory',
        needBytes: 3 * GI,
        roomBytes: GI,
      });
      const started = (resources?: { limits: { memory: string } }): AdmissionView => ({
        ...live('held', 'starting'),
        state: {
          harness: 'a',
          resources: { limits: { memory: '512Mi' } },
          attempts: [{ ended: null, ...(resources ? { resources } : {}) }],
        },
      });
      const small = { ...queued('small', 2), state: { ...queued('small', 2).state, resources: { limits: { memory: '256Mi' } } } };
      assert.deepEqual(waitOf(small, [started({ limits: { memory: '1Gi' } })]), { for: 'memory', needBytes: GI / 4, roomBytes: 0 });
      assert.equal(waitOf(small, [started()]), undefined, 'counted at its filed 512Mi: 768Mi of 1Gi');
    },
  );
  await t.test(
    'toAdmit: a harness that shares a pool counts against its ceiling, listed first so a pool by harness name alone reads two',
    () => {
      const views = [live('b-1', 'working', 'b'), live('a-1', 'working'), queued('a-2', 1), queued('b-2', 2, 'b')];
      assert.deepEqual(admittedIds(views, under(2, sharing)), []);
      assert.deepEqual(admittedIds(views, under(3, sharing)), ['a-2']);
      assert.deepEqual(admittedIds(views, under(2)), ['a-2', 'b-2'], 'each its own pool');
    },
  );
  await t.test('toAdmit: the ceiling is counted per pool, and a task with no harness counts in `default`', () => {
    const views = [
      live('x-1', 'working', 'x'),
      live('x-2', 'working', 'x'),
      live('k-1', 'working', 'k'),
      queued('a-1', 1),
      queued('x-3', 2, 'x'),
      queued('k-2', 3, 'k'),
      queued('k-3', 4, 'k'),
      queued('f-1', 5, 'f'),
    ];
    assert.deepEqual(admittedIds(views, under(2)), ['a-1', 'k-2', 'f-1']);
    const bare = (id: string, admission?: 'queued'): AdmissionView => ({
      id,
      phase: admission ? 'pending' : 'working',
      ...(admission ? { admission } : {}),
      state: {},
    });
    assert.deepEqual(admittedIds([bare('d-1'), bare('d-2', 'queued'), queued('def', 1, 'default')], under(1)), [], '`default` is full');
    assert.deepEqual(admittedIds([bare('d-1'), queued('a-1', 1)], under(1)), ['a-1']);
  });
  await t.test('toAdmit: each task admitted is counted at once, a full pool admits nothing more, and it drains one for one', () => {
    const waiting = [queued('a-1', 1), queued('a-2', 2), queued('a-3', 3)];
    assert.deepEqual(admittedIds(waiting, under(2)), ['a-1', 'a-2']);
    const next = [{ ...waiting[0], admission: 'admitted' as const }, { ...waiting[1], admission: 'admitted' as const }, waiting[2]];
    assert.deepEqual(admittedIds(next, under(2)), [], 'the pass after: those two hold their slots');
    assert.deepEqual(admittedIds([next[0], next[2]], under(2)), ['a-3'], 'one ended: exactly one more');
  });
  await t.test('toAdmit: a session blocked on a person holds no slot, and counts again once it works again', () => {
    assert.deepEqual(admittedIds([live('a-1', 'needs-human'), live('a-2', 'input-required'), queued('a-3', 1)], under(1)), ['a-3']);
    assert.deepEqual(admittedIds([live('a-1', 'working'), live('a-2', 'input-required'), queued('a-3', 1)], under(1)), []);
  });
  await t.test(
    'toAdmit: the higher priority first, then the earlier filing, then the lower id, each against the order it is given in',
    () => {
      assert.deepEqual(
        admittedIds([queued('first', 1, 'a', 0), queued('after', 9, 'a', 1)], under(1)),
        ['after'],
        'priority over the filing',
      );
      assert.deepEqual(admittedIds([queued('first', 1), queued('after', 9)], under(1)), ['first'], 'with none, filing order');
      assert.deepEqual(admittedIds([queued('low', 1, 'a', -1), queued('none', 2)], under(1)), ['none'], 'no priority is 0, above -1');
      assert.deepEqual(admittedIds([queued('a-a', 20), queued('a-b', 10)], under(1)), ['a-b'], 'the later id filed first');
      assert.deepEqual(admittedIds([queued('a-b', 5), queued('a-a', 5)], under(1)), ['a-a']);
      assert.deepEqual(admittedIds([queued('a-a', 5), queued('a-b', 5)], under(1)), ['a-a']);
      const garbled = { ...queued('a-a', 0), state: { harness: 'a', filedAt: 'garbage' } };
      assert.deepEqual(admittedIds([garbled, queued('a-b', 50)], under(1)), ['a-b'], 'a time that does not parse goes last');
    },
  );
  await t.test('toAdmit: no ceiling admits nothing, and a task admitted or not queued is never admitted again', () => {
    assert.deepEqual(admittedIds([queued('w', 1)], { poolOf: ownPool }), []);
    assert.deepEqual(
      admittedIds(
        [
          { ...queued('a-1', 1), admission: 'admitted' as const },
          { ...queued('a-2', 2), admission: undefined },
        ],
        under(5),
      ),
      [],
    );
  });
  await t.test('toAdmit: a rule unschedulable admits nothing while it says so, and admits again once it does not, asked each time', () => {
    const waiting = [queued('a-1', 1), queued('a-2', 2)];
    let unschedulable = true;
    const rule = { ...under(2), unschedulable: () => unschedulable };
    assert.deepEqual(admittedIds(waiting, rule), [], 'unschedulable: nothing admitted, though the pool has room');
    unschedulable = false;
    assert.deepEqual(admittedIds(waiting, rule), ['a-1', 'a-2'], 'schedulable again: the same rule admits as a ceiling does');
  });
});

/**
 * The laws of a whole pass, which sum over its waiters: `contracts/admission.contract.ts` proves `admitOne`, what `admitting`
 * decides of each waiter, and the verifier proves no sum over an array without a loop's invariant in the code, which imports nothing
 * of it. Each law here is one design wrote of `admitting`, but `admittedInTurn`, held on every pass `passes` builds.
 */
const sumOf = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const admittedNeed = (pass: AdmissionPass, out: Admitted): number =>
  sumOf(pass.waiting.filter((w) => out.admit.includes(w.id)).map((w) => w.needBytes));
const promised = (pass: AdmissionPass): number => sumOf(pass.holders.map((h) => h.needBytes));
const unseen = (pass: AdmissionPass): number => sumOf(pass.holders.filter((h) => !h.running).map((h) => h.needBytes));
const heldInPool = (pass: AdmissionPass, pool: string): number => pass.holders.filter((h) => h.pool === pool).length;
const inPoolAfter = (pass: AdmissionPass, out: Admitted, pool: string): number =>
  heldInPool(pass, pool) + pass.waiting.filter((w) => w.pool === pool && out.admit.includes(w.id)).length;
const roomAfter = (pass: AdmissionPass, m: MachineMemory, out: Admitted): number =>
  Math.min(m.totalBytes - m.reservedBytes - promised(pass), m.availableBytes - m.reservedBytes - unseen(pass)) - admittedNeed(pass, out);
const waitOf = (out: Admitted, id: string): AdmissionWait | undefined => out.waits.find((x) => x.id === id)?.wait;

/** Each law of a whole pass, by design's name: true where the pass keeps it. */
const PASS_LAWS: Record<string, (pass: AdmissionPass, out: Admitted) => boolean> = {
  eachWaiterAnsweredOnce: (pass, out) =>
    out.admit.length + out.waits.length === pass.waiting.length &&
    pass.waiting.every((w) => out.admit.includes(w.id) !== out.waits.some((x) => x.id === w.id)),
  admittedInTurn: (pass, out) =>
    out.admit.join(',') ===
    pass.waiting
      .filter((w) => out.admit.includes(w.id))
      .map((w) => w.id)
      .join(','),
  ceilingKept: (pass, out) =>
    pass.waiting.every(
      (w) => inPoolAfter(pass, out, w.pool) - heldInPool(pass, w.pool) <= Math.max(0, pass.ceiling - heldInPool(pass, w.pool)),
    ),
  requestsFitTheMachine: (pass, out) =>
    pass.machine === null || admittedNeed(pass, out) <= Math.max(0, pass.machine.totalBytes - pass.machine.reservedBytes - promised(pass)),
  availableCoversTheNewcomers: (pass, out) =>
    pass.machine === null ||
    admittedNeed(pass, out) <= Math.max(0, pass.machine.availableBytes - pass.machine.reservedBytes - unseen(pass)),
  slotWaitMeansAFullPool: (pass, out) =>
    pass.waiting.every((w) => {
      const wait = waitOf(out, w.id);
      return (
        wait?.for !== 'slot' || (wait.pool === w.pool && wait.ceiling === pass.ceiling && inPoolAfter(pass, out, w.pool) >= pass.ceiling)
      );
    }),
  memoryWaitMeansItDidNotFit: (pass, out) =>
    pass.waiting.every((w) => {
      const wait = waitOf(out, w.id);
      if (wait?.for !== 'memory') return true;
      if (pass.machine === null) return false;
      const left = roomAfter(pass, pass.machine, out);
      return (
        wait.needBytes === w.needBytes &&
        w.needBytes > left &&
        wait.roomBytes >= Math.max(0, left) &&
        wait.roomBytes < wait.needBytes &&
        Number.isInteger(wait.roomBytes)
      );
    }),
  unreadMachineAdmitsByTheCeilingAlone: (pass, out) => pass.machine !== null || out.waits.every((x) => x.wait.for === 'slot'),
  stopsAtTheFloorOfAvailableOverTheLimit: (pass, out) => {
    const m = pass.machine;
    const first = pass.waiting[0];
    if (m === null || first === undefined || pass.holders.length > 0) return true;
    const need = first.needBytes;
    const alike = pass.waiting.every((w) => w.needBytes === need && w.pool === first.pool);
    if (!alike || need <= 0 || pass.ceiling < pass.waiting.length || m.totalBytes < m.availableBytes) return true;
    return out.admit.length === Math.min(pass.waiting.length, Math.floor(Math.max(0, m.availableBytes - m.reservedBytes) / need));
  },
};

/** A generator of whole numbers from a seed (mulberry32): the same passes on every run. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return (below: number): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % below;
  };
};

/**
 * Passes over two pools and a few needs, on a machine read or not: `count` of every shape, and as many of the shape
 * `stopsAtTheFloorOfAvailableOverTheLimit` speaks of (nothing held, alike waiters under a ceiling that leaves the memory to decide).
 */
const passes = (seed: number, count: number): AdmissionPass[] => {
  const n = seeded(seed);
  const NEEDS = [0, 1, 2, 3, 5];
  const POOLS = ['a', 'b'];
  const machine = (): MachineMemory => {
    const totalBytes = n(16);
    return { totalBytes, availableBytes: n(totalBytes + 3), reservedBytes: n(4) };
  };
  const pick = <T>(xs: readonly T[]): T => xs[n(xs.length)];
  const out: AdmissionPass[] = [];
  for (let i = 0; i < count; i++) {
    const holders: Holder[] = Array.from({ length: n(4) }, () => ({ pool: pick(POOLS), needBytes: pick(NEEDS), running: n(2) === 0 }));
    const waiting: Waiter[] = Array.from({ length: n(6) }, (_, k) => ({ id: `w${k}`, pool: pick(POOLS), needBytes: pick(NEEDS) }));
    out.push({ ceiling: 1 + n(3), machine: n(4) === 0 ? null : machine(), holders, waiting });
    const need = 1 + n(4);
    const pool = pick(POOLS);
    const alike: Waiter[] = Array.from({ length: n(6) }, (_, k) => ({ id: `w${k}`, pool, needBytes: need }));
    const m = machine();
    out.push({
      ceiling: alike.length + n(2) + 1,
      machine: { ...m, availableBytes: Math.min(m.availableBytes, m.totalBytes) },
      holders: [],
      waiting: alike,
    });
  }
  return out;
};

test("admitting, the whole pass: each law design wrote of it, and the order it admits in, holds on 4000 passes from a seed, `admitOne`'s laws being proved by the contract", async (t) => {
  const all = passes(20261113, 2000);
  for (const [law, holds] of Object.entries(PASS_LAWS)) {
    await t.test(law, () => {
      const broken = all.find((pass) => !holds(pass, admitting(pass)));
      assert.equal(broken, undefined, `${law} is broken on ${JSON.stringify(broken)}`);
    });
  }
  await t.test('the passes reach every answer: an admission, a slot wait and a memory wait, on a machine read and not', () => {
    const answers = all.map(admitting);
    assert.ok(answers.some((o) => o.admit.length > 0));
    assert.ok(answers.some((o) => o.waits.some((x) => x.wait.for === 'slot')));
    assert.ok(answers.some((o) => o.waits.some((x) => x.wait.for === 'memory')));
    assert.ok(all.some((p, i) => p.machine === null && (answers[i]?.admit.length ?? 0) > 0));
    const floorCases = all.filter(
      (p) =>
        p.holders.length === 0 &&
        p.machine !== null &&
        p.waiting.length > 1 &&
        p.waiting.every((w) => w.pool === p.waiting[0]?.pool && w.needBytes === p.waiting[0]?.needBytes && w.needBytes > 0) &&
        p.ceiling >= p.waiting.length,
    );
    assert.ok(
      floorCases.some((p) => {
        const k = admitting(p).admit.length;
        return k > 0 && k < p.waiting.length;
      }),
      'a floor below the waiters',
    );
  });
});

test('admitting and roomOf: the rows a person reads the whole pass by', async (t) => {
  const machine = (totalBytes: number, availableBytes: number, reservedBytes: number): MachineMemory => ({
    totalBytes,
    availableBytes,
    reservedBytes,
  });
  await t.test('roomOf: the lesser of the total less the floor and every holder, and the available less the floor and the unseen', () => {
    const holders: Holder[] = [
      { pool: 'a', needBytes: 3, running: true },
      { pool: 'b', needBytes: 2, running: false },
    ];
    assert.equal(roomOf(machine(16, 11, 1), holders), Math.min(16 - 1 - 5, 11 - 1 - 2));
    assert.equal(roomOf(machine(16, 4, 1), holders), 4 - 1 - 2, 'the available memory the lesser');
    assert.equal(roomOf(machine(6, 11, 1), holders), 6 - 1 - 5, 'the promised the lesser');
    assert.equal(roomOf(machine(2, 2, 1), holders), 2 - 1 - 5, 'below nothing where the machine is already past it');
    assert.equal(roomOf(machine(16, 11, 1), []), 10);
  });
  await t.test('a waiter that does not fit is passed by a smaller one behind it, and a need of nothing always fits', () => {
    const out = admitting({
      ceiling: 5,
      machine: machine(16, 4, 1),
      holders: [],
      waiting: [
        { id: 'big', pool: 'a', needBytes: 5 },
        { id: 'small', pool: 'a', needBytes: 2 },
        { id: 'next', pool: 'a', needBytes: 2 },
        { id: 'none', pool: 'a', needBytes: 0 },
      ],
    });
    assert.deepEqual(out.admit, ['small', 'none']);
    assert.deepEqual(out.waits, [
      { id: 'big', wait: { for: 'memory', needBytes: 5, roomBytes: 3 } },
      { id: 'next', wait: { for: 'memory', needBytes: 2, roomBytes: 1 } },
    ]);
  });
  await t.test('a full pool says slot before memory, and the room told is never below nothing', () => {
    const out = admitting({
      ceiling: 1,
      machine: machine(4, 4, 1),
      holders: [{ pool: 'a', needBytes: 6, running: true }],
      waiting: [
        { id: 'a-1', pool: 'a', needBytes: 1 },
        { id: 'b-1', pool: 'b', needBytes: 1 },
      ],
    });
    assert.deepEqual(out.admit, []);
    assert.deepEqual(out.waits, [
      { id: 'a-1', wait: { for: 'slot', pool: 'a', ceiling: 1 } },
      { id: 'b-1', wait: { for: 'memory', needBytes: 1, roomBytes: 0 } },
    ]);
  });
});

test('REFUSED at shipped defaults: an `unschedulable` that is not a function builds no engine', () => {
  assert.throws(
    () =>
      builtEngine(
        Engine.layer({
          root: scratch('ae-admission-root-'),
          journal: asyncStore(memoryJournal()),
          unschedulable: true as never,
        }),
      ),
    (err: Error) => err.message.includes('`unschedulable` is a function, `() => boolean`, asked on every pass'),
  );
});
