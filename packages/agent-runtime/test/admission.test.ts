/**
 * The engine's ceiling: a pass admits the tasks filed `queued` while their pool has room, the highest `priority` first, then the
 * earliest filed, then the lower id, and the pass after it starts them. Each order is proven by a fixture listed in the opposite
 * one, and each pool by a fixture that shares or splits it.
 */
import { Effect, Layer } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Event, FeedEntry, HarnessConfig, Sighting, TaskPhase, TaskView } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { nameFor } from '../src/core/domain.ts';
import { Journal } from '../src/core/engine/journal.ts';
import { Runner } from '../src/harness/seam.ts';
import { file } from '../src/core/engine/filing.ts';
import { Admission, tick, view } from '../src/core/engine/engine.ts';
import { tickMemoLayer } from '../src/core/engine/memo.ts';
import { holdsSlot, ownPool, toAdmit, type AdmissionRule, type AdmissionView } from '../src/core/admission.ts';
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

/**
 * A board of harnesses `a` (pool `claude`) and `checks` under a ceiling of 6, whose machine is what `machine` says on each pass, and
 * which keeps `reserved` off it when given.
 */
const machineBoard = (reserved: string | undefined, machine: { totalBytes: number; availableBytes: number }, maxConcurrent = 6) => {
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

test("a task filed with no resources of its own is filed with the engine's default request beside its default limit, as a LimitRange writes both; one with its own keeps them", async () => {
  const engine = builtEngine(
    Engine.layer({
      root: scratch('ae-admission-root-'),
      journal: asyncStore(memoryJournal()),
      harnesses: { a: asyncOps(fake(new Map())) },
      defaultHarness: 'a',
      defaultLimits: { memory: '8Gi' },
      defaultRequests: { memory: '2560Mi' },
    }),
  );
  const bare = await Effect.runPromise(engine.file({ brief: 'b', cwd: '/r', queued: true }));
  const own = await Effect.runPromise(engine.file({ brief: 'o', cwd: '/r', queued: true, resources: { limits: { memory: '4Gi' } } }));
  assert.deepEqual((await Effect.runPromise(engine.view(bare))).state.resources, {
    limits: { memory: '8Gi' },
    requests: { memory: '2560Mi' },
  });
  assert.deepEqual(
    (await Effect.runPromise(engine.view(own))).state.resources,
    { limits: { memory: '4Gi' } },
    'its limit stands for its request',
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
