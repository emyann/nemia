/**
 * The A2A seam's task store is a view: a runtime restarted mid-session answers for sessions it never started, before its
 * first tick, off the harness and the journal alone — and stops them, and settles them, as the one that died would have.
 *
 * Two engines on one journal and one fake harness stand for a runtime before and after a restart; a client built fresh
 * over the same two stands for anyone asking the restarted one's agent, with nothing in its memory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { TaskState } from '@a2a-js/sdk';
import { clientOf } from '../src/a2a/client.ts';
import { sightingOf } from '../src/a2a/map.ts';
import type { Event, Sighting, SpawnRequest } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import type { RunnerOps } from '../src/harness/seam.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';

/**
 * A journal in memory and a harness whose sessions a test moves by hand: what outlives a runtime's process. With
 * `spawnHangs`, a spawn registers its session and never answers: the runtime dies inside it.
 *
 * Returns `runtime`, a runtime's process started on what outlives it, and `client`, the fake's agent as a new process builds
 * it: a client over a handler with nothing in its memory.
 */
const world = (o: { spawnHangs?: boolean } = {}) => {
  const tasks = new Map<string, Event[]>();
  const journal: AsyncJournal = {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed() {
      return { entries: [], cursor: 0 };
    },
  };
  const sessions = new Map<string, Sighting>();
  const asked: Array<[string, unknown]> = [];
  let n = 0;
  const fake = {
    async spawn(r: SpawnRequest) {
      asked.push(['spawn', r.name]);
      const id = `s-${++n}`;
      sessions.set(r.name, { sessionId: id, state: 'working', busy: true, nativeId: id });
      if (o.spawnHangs) await new Promise(() => {});
    },
    async observe() {
      asked.push(['observe', undefined]);
      return new Map(sessions);
    },
    async stop(sessionId) {
      asked.push(['stop', sessionId]);
      for (const [name, s] of sessions) if (s.sessionId === sessionId) sessions.set(name, { ...s, state: 'canceled', busy: false });
    },
    async logs() {
      return '';
    },
  } satisfies AsyncRunner;
  const runtime = () =>
    builtEngine(Engine.layer({ root: scratch('ae-restart-root-'), journal: asyncStore(journal), harnesses: { fake: asyncOps(fake) } }));
  const ops: RunnerOps = {
    spawn: (r) => Effect.promise(() => fake.spawn(r)),
    observe: Effect.promise(() => fake.observe()),
    stop: (id) => Effect.promise(() => fake.stop(id)),
    logs: () => Effect.promise(() => fake.logs()),
  };
  const client = () => clientOf('fake', ops, (taskId) => journal.read(taskId));
  return { runtime, client, sessions, asked, journal };
};

const filing = { id: 't-r', brief: 'keep at it', cwd: '/repo', harness: 'fake' };
/** Listed by the session's context: the id its harness gave it, `s-1`, which a new process learns only from the harness. */
const listing = {
  tenant: '',
  contextId: 's-1',
  status: TaskState.TASK_STATE_UNSPECIFIED,
  pageSize: 50,
  pageToken: '',
  historyLength: undefined,
  statusTimestampAfter: undefined,
  includeArtifacts: false,
};

test('a restarted runtime answers for a session it never started, then stops it and settles, before and after a tick', async (t) => {
  const s = story(t);
  const w = world();
  const a = w.runtime();
  let id = '';
  let b = a;

  await s.test('the first runtime files the task and spawns its session', async () => {
    id = await Effect.runPromise(a.file(filing));
    await Effect.runPromise(a.tick());
    assert.deepEqual(w.sessions.get('ae/t-r/1'), { sessionId: 's-1', state: 'working', busy: true, nativeId: 's-1' });
  });

  await s.test(
    'the first runtime gone, the second not yet ticked: an agent that holds nothing answers off the harness, by id and by its context',
    async () => {
      b = w.runtime();
      const fresh = w.client();
      const task = await fresh.getTask({ tenant: '', id: 'ae/t-r/1', historyLength: undefined });
      assert.equal(task.status!.state, TaskState.TASK_STATE_WORKING);
      assert.deepEqual(sightingOf(task), w.sessions.get('ae/t-r/1'));
      const listed = await fresh.listTasks(listing);
      assert.deepEqual(
        listed.tasks.map((t) => [t.id, t.contextId, t.status!.state]),
        [['ae/t-r/1', 's-1', TaskState.TASK_STATE_WORKING]],
      );
    },
  );

  await s.test(
    "asked to stop, the second runtime's pass observes, finds the session through its agent and stops it on the harness; the next settles it",
    async () => {
      await Effect.runPromise(b.stop(id));
      w.asked.length = 0;
      await Effect.runPromise(b.tick());
      assert.deepEqual(
        w.asked,
        [
          ['observe', undefined],
          ['observe', undefined],
          ['stop', 's-1'],
        ],
        "the second runtime's pass observes; then its agent, asked to cancel, observes to find the session and stops it on the harness",
      );
      assert.equal(w.sessions.get('ae/t-r/1')!.state, 'canceled');
      await Effect.runPromise(b.tick());
      assert.equal((await Effect.runPromise(b.view(id))).phase, 'stopped');
    },
  );

  await s.test('the harness let the session go: the journal answers for it, canceled by the operator', async () => {
    w.sessions.delete('ae/t-r/1');
    const after = await w.client().getTask({ tenant: '', id: 'ae/t-r/1', historyLength: undefined });
    assert.equal(after.status!.state, TaskState.TASK_STATE_CANCELED);
    assert.equal((after.metadata!.attempt as { reason: string }).reason, 'operator');
  });
});

test('a spawn the runtime died inside is adopted by the next one by name, never started twice', async () => {
  const w = world({ spawnHangs: true });
  const a = w.runtime();
  const id = await Effect.runPromise(a.file(filing));
  void Effect.runPromise(a.tick());
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(
    w.asked.filter(([verb]) => verb === 'spawn'),
    [['spawn', 'ae/t-r/1']],
  );
  assert.deepEqual(
    (await w.journal.read(id)).map((e) => e.kind),
    ['filed', 'starting'],
    'the spawn never answered: the session exists, and the journal says only that its attempt was starting',
  );

  const b = w.runtime();
  const task = await w.client().getTask({ tenant: '', id: 'ae/t-r/1', historyLength: undefined });
  assert.equal(task.status!.state, TaskState.TASK_STATE_WORKING, 'the agent answers off the harness before any tick');
  await Effect.runPromise(b.tick());
  assert.deepEqual(
    w.asked.filter(([verb]) => verb === 'spawn'),
    [['spawn', 'ae/t-r/1']],
    'adopted, not spawned again',
  );
  assert.equal((await Effect.runPromise(b.view(id))).phase, 'running (working)');

  w.sessions.set('ae/t-r/1', { ...w.sessions.get('ae/t-r/1')!, state: 'completed', busy: false });
  await Effect.runPromise(b.tick());
  assert.equal((await Effect.runPromise(b.view(id))).phase, 'succeeded');
});
