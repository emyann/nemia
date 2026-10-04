/**
 * The engine's ceiling: a pass admits the tasks filed `queued` while their pool has room, the highest `priority` first, then the
 * earliest filed, then the lower id, and the pass after it starts them. Each order is proven by a fixture listed in the opposite
 * one, and each pool by a fixture that shares or splits it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Event, FeedEntry, HarnessConfig, PromiseJournal, PromiseRunner, Sighting } from '../src/facade.ts';
import { Engine, promiseEngine } from '../src/index.ts';
import { nameFor } from '../src/core/domain.ts';
import { holdsSlot, ownPool, toAdmit, type AdmissionView } from '../src/core/admission.ts';

const memoryJournal = (): PromiseJournal => {
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
const fake = (sessions: Map<string, Sighting>): PromiseRunner => ({
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
    a: { ...fake(sessions), ...(pools.a ? { pool: pools.a } : {}) },
    b: { ...fake(sessions), ...(pools.b ? { pool: pools.b } : {}) },
  };
  const engine = promiseEngine(Engine.layer({ journal, harnesses, defaultHarness: 'a', ...(maxConcurrent ? { maxConcurrent } : {}) }));
  return { engine, sessions, journal };
};

/** File `id` queued on `harness` as of `at`, with `priority` when given: the entry `file` writes, at a time the test chooses. */
const fileAt = (journal: PromiseJournal, id: string, at: string, harness = 'a', priority?: number) =>
  journal.append(id, { kind: 'filed', at, brief: id, cwd: '/r', harness, queued: true, ...(priority !== undefined ? { priority } : {}) });

const started = (sessions: Map<string, Sighting>) => [...sessions.keys()].sort();

test('under a ceiling of 1, the queued task of the highest priority is admitted, wherever it is listed and whenever filed', async () => {
  const b = board(1);
  await fileAt(b.journal, 'x', '2026-10-04T09:00:00.000Z', 'a', 0);
  await fileAt(b.journal, 'y', '2026-10-04T09:00:02.000Z', 'a', 1);
  await fileAt(b.journal, 'z', '2026-10-04T09:00:01.000Z', 'a', 0);
  const first = await b.engine.tick();
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
  await b.engine.tick();
  assert.deepEqual(started(b.sessions), [nameFor('y', 1)], 'the next pass starts it');
});

test('of one priority, the earliest filed is admitted, against the order the store lists them in', async () => {
  const b = board(1);
  await fileAt(b.journal, 'a1', '2026-10-04T09:00:02.000Z');
  await fileAt(b.journal, 'a2', '2026-10-04T09:00:01.000Z');
  await fileAt(b.journal, 'a3', '2026-10-04T09:00:00.000Z');
  await b.engine.tick();
  await b.engine.tick();
  assert.deepEqual(started(b.sessions), [nameFor('a3', 1)]);
});

test('two harnesses sharing a pool share its ceiling: one at work holds the other back, and apart each is admitted', async () => {
  const shared = board(1, { a: 'x', b: 'x' });
  await fileAt(shared.journal, 'on-b', '2026-10-04T09:00:00.000Z', 'b');
  await shared.engine.tick();
  await shared.engine.tick();
  assert.deepEqual(started(shared.sessions), [nameFor('on-b', 1)], '`on-b` at work');
  await fileAt(shared.journal, 'on-a', '2026-10-04T09:00:01.000Z', 'a');
  const held = await shared.engine.tick();
  assert.equal(held.views.find((v) => v.id === 'on-a')?.admission, 'queued', "`on-a` waits: its pool's one slot is held");

  const apart = board(1, { a: 'x' });
  await fileAt(apart.journal, 'on-b', '2026-10-04T09:00:00.000Z', 'b');
  await apart.engine.tick();
  await apart.engine.tick();
  await fileAt(apart.journal, 'on-a', '2026-10-04T09:00:01.000Z', 'a');
  const admitted = await apart.engine.tick();
  assert.equal(admitted.views.find((v) => v.id === 'on-a')?.admission, 'admitted', "with `b`'s pool its own, `on-a` is admitted");
});

test('with no ceiling the pass admits nothing: a queued task waits for `admit`, as ever', async () => {
  const b = board(undefined);
  await fileAt(b.journal, 'q', '2026-10-04T09:00:00.000Z');
  for (let i = 0; i < 3; i++) await b.engine.tick();
  assert.equal(b.sessions.size, 0);
  assert.equal((await b.engine.view('q')).admission, 'queued');
  await b.engine.admit(['q']);
  await b.engine.tick();
  assert.deepEqual(started(b.sessions), [nameFor('q', 1)]);
});

test('the order is the journal’s: an engine that never saw the filing admits by the priority it reads back', async () => {
  const journal = memoryJournal();
  await fileAt(journal, 'low', '2026-10-04T09:00:00.000Z', 'a', 0);
  await fileAt(journal, 'high', '2026-10-04T09:00:01.000Z', 'a', 7);
  const after = board(1, {}, journal);
  await after.engine.tick();
  await after.engine.tick();
  assert.deepEqual(started(after.sessions), [nameFor('high', 1)]);
});

test('toAdmit: a slot is held by a session at work, one starting and one admitted, and by none blocked or between attempts', () => {
  const view = (id: string, phase: string, admission?: 'queued' | 'admitted', harness?: string): AdmissionView => ({
    id,
    phase,
    ...(admission ? { admission } : {}),
    state: { ...(harness ? { harness } : {}), filedAt: '2026-10-04T09:00:00.000Z' },
  });
  for (const phase of ['running (working)', 'working (quiescent)', 'starting']) assert.equal(holdsSlot(view('h', phase)), true, phase);
  assert.equal(holdsSlot(view('h', 'pending', 'admitted')), true, 'admitted');
  for (const phase of ['needs-human', 'input-required', 'between attempts', 'pending'])
    assert.equal(holdsSlot(view('h', phase)), false, phase);
  const rule = { ceiling: 1, poolOf: ownPool };
  assert.deepEqual(
    toAdmit([view('busy', 'running (working)'), view('w', 'pending', 'queued')], rule),
    [],
    'a task with no harness counts in `default`',
  );
  assert.deepEqual(toAdmit([view('busy', 'running (working)', undefined, 'x'), view('w', 'pending', 'queued')], rule), ['w']);
  assert.deepEqual(toAdmit([view('w', 'pending', 'queued')], { poolOf: ownPool }), [], 'no ceiling admits nothing');
});
